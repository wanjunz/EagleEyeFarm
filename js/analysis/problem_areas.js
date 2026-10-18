// Problem-area detection on a vegetation-index map.
// Follows CoFly's Problematic-Areas-Detection module (MIT), reimplemented in JS with its bugs fixed:
//   1. threshold at min + 25% of the display range (low index = stressed / bare)
//   2. 5x5 closing then 5x5 opening to remove speckle
//   3. 8-connected regions, centre of mass per region
//   4. (changed) patches closer than one close-up photo footprint are merged; CoFly's k-means into
//      2-10 clusters (Calinski-Harabasz) put points *between* distant patches and is not used.
// Fixes vs. the original (measured in the README comparison): soil between crop rows is not flagged
// (1.5 m smoothing + must be clearly below the field median), no-data pixels are never flagged,
// row/column are not swapped when georeferencing, and 0-2 patches no longer crash or invent points.

function morph(mask, w, h, r, dilate) {
    // separable square structuring element (2r+1)
    const tmp = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let v = dilate ? 0 : 1;
            for (let k = -r; k <= r; k++) {
                const xx = x + k;
                const m = xx < 0 || xx >= w ? (dilate ? 0 : 1) : mask[y * w + xx];
                if (dilate ? m : !m) { v = dilate ? 1 : 0; break; }
            }
            tmp[y * w + x] = v;
        }
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let v = dilate ? 0 : 1;
            for (let k = -r; k <= r; k++) {
                const yy = y + k;
                const m = yy < 0 || yy >= h ? (dilate ? 0 : 1) : tmp[yy * w + x];
                if (dilate ? m : !m) { v = dilate ? 1 : 0; break; }
            }
            out[y * w + x] = v;
        }
    }
    return out;
}

const close = (m, w, h, r) => morph(morph(m, w, h, r, true), w, h, r, false);
const open = (m, w, h, r) => morph(morph(m, w, h, r, false), w, h, r, true);

/** 8-connected components. Returns [{count, cx, cy}] (pixel coordinates). */
function regions(mask, w, h) {
    const label = new Int32Array(mask.length);
    const out = [];
    const stack = [];
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || label[i]) continue;
        const id = out.length + 1;
        let count = 0, sx = 0, sy = 0;
        label[i] = id; stack.push(i);
        while (stack.length) {
            const p = stack.pop();
            const px = p % w, py = (p - px) / w;
            count++; sx += px; sy += py;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = px + dx, ny = py + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const q = ny * w + nx;
                    if (mask[q] && !label[q]) { label[q] = id; stack.push(q); }
                }
            }
        }
        out.push({ count, cx: sx / count, cy: sy / count });
    }
    return out;
}

function medianOf(values) {
    const step = Math.max(1, Math.floor(values.length / 50000));
    const sample = [];
    for (let i = 0; i < values.length; i += step) if (!Number.isNaN(values[i])) sample.push(values[i]);
    if (!sample.length) return 0;
    sample.sort((a, b) => a - b);
    return sample[Math.floor(sample.length / 2)];
}

/** Single-linkage grouping: patches closer than `dist` px join one group (weighted centre). */
function mergeNearby(pts, dist) {
    const parent = pts.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
            if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) <= dist) parent[find(i)] = find(j);
        }
    }
    const groups = new Map();
    pts.forEach((p, i) => {
        const g = groups.get(find(i)) || { sx: 0, sy: 0, w: 0 };
        g.sx += p.x * p.w; g.sy += p.y * p.w; g.w += p.w;
        groups.set(find(i), g);
    });
    return [...groups.values()].map(g => ({ x: g.sx / g.w, y: g.sy / g.w, weight: g.w }));
}

/**
 * Find problem-area centres in an index map.
 * @param {Float32Array} values  index values (NaN = no data)
 * @param {[number,number]} range display range from indices.displayRange
 * @returns {{points:[{x,y,weight}], mask:Uint8Array, threshold:number, regionCount:number}}
 */
/** NaN-aware box blur (separable, running sums: cost does not depend on the radius). */
function boxBlur(values, w, h, r) {
    if (!r || r < 1) return values;
    const pass = (src, horizontal) => {
        const dst = new Float32Array(src.length);
        const lines = horizontal ? h : w, len = horizontal ? w : h;
        const idx = horizontal ? (a, b) => a * w + b : (a, b) => b * w + a;
        for (let a = 0; a < lines; a++) {
            let sum = 0, n = 0;
            for (let b = 0; b <= Math.min(r, len - 1); b++) { const v = src[idx(a, b)]; if (!Number.isNaN(v)) { sum += v; n++; } }
            for (let b = 0; b < len; b++) {
                const i = idx(a, b);
                dst[i] = Number.isNaN(src[i]) ? NaN : (n ? sum / n : NaN);
                const add = b + r + 1, rem = b - r;
                if (add < len) { const v = src[idx(a, add)]; if (!Number.isNaN(v)) { sum += v; n++; } }
                if (rem >= 0) { const v = src[idx(a, rem)]; if (!Number.isNaN(v)) { sum -= v; n--; } }
            }
        }
        return dst;
    };
    return pass(pass(values, true), false);
}

function detect(values, width, height, range, opts = {}) {
    // Average over ~1 m first (opts.blurRadius px) so bare soil between crop rows is not reported
    // as a problem area; real stressed or bare patches are larger than the row spacing.
    values = boxBlur(values, width, height, opts.blurRadius || 0);
    // CoFly threshold: lowest 25% of the display range. Additionally a pixel must be clearly below the
    // field's typical (median) value, so JPEG noise in an evenly healthy field is never flagged.
    const median = medianOf(values);
    const minDrop = opts.minDrop != null ? opts.minDrop : 0.05;
    const threshold = Math.min(range[0] + (range[1] - range[0]) * (opts.fraction != null ? opts.fraction : 0.25), median - minDrop);
    let mask = new Uint8Array(values.length);
    for (let i = 0; i < values.length; i++) mask[i] = !Number.isNaN(values[i]) && values[i] < threshold ? 1 : 0;
    const r = opts.radius != null ? opts.radius : 2;   // 5x5
    mask = open(close(mask, width, height, r), width, height, r);
    const minPixels = opts.minPixels != null ? opts.minPixels : Math.max(4, Math.round(width * height * 0.0002));
    // regions covering most of the image describe the whole view, not a patch
    const maxPixels = (opts.maxAreaFraction != null ? opts.maxAreaFraction : 0.6) * width * height;
    const regs = regions(mask, width, height).filter(g => g.count >= minPixels && g.count <= maxPixels);
    const pts = regs.map(g => ({ x: g.cx, y: g.cy, w: g.count }));

    // Group patches that are close enough to be covered by one close-up photo (opts.mergePixels),
    // instead of CoFly's k-means into 2-10 clusters, which put points between distant patches.
    const centers = mergeNearby(pts, opts.mergePixels != null ? opts.mergePixels : Math.max(width, height) * 0.08);
    centers.sort((a, b) => b.weight - a.weight);
    return { points: centers.slice(0, opts.maxPoints || 20), mask, threshold, regionCount: regs.length };
}

/**
 * Pixel -> lat/lng for a north-up image covering bounds {north,south,east,west}.
 */
function pixelToLatLng(x, y, width, height, bounds) {
    return {
        lat: bounds.north - (y + 0.5) / height * (bounds.north - bounds.south),
        lng: bounds.west + (x + 0.5) / width * (bounds.east - bounds.west)
    };
}

module.exports = { detect, regions, mergeNearby, pixelToLatLng, morph, boxBlur };
