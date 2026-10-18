// Weed detection for close-up Potensic Atom 2 photos (taken low, e.g. 5-10 m, camera straight down).
//
// CoFly's deep-learning weed model cannot be used: its trained weights (weights0300.hdf5) were never
// published. This module uses the training-free approach of Bah, Hafiane & Canals (2018) (research
// paper D2 in the README): in row crops, vegetation that grows *between* the crop rows is weed.
//   1. Vegetation mask: Excess Green ExG = 2g - r - b on chromatic coordinates, Otsu threshold.
//   2. Crop-row direction: the angle whose projection profile of vegetation is most "peaky".
//   3. Crop rows: peaks of that profile at the row spacing; each row is a band around its centre line.
//   4. Weeds: vegetation pixels outside every row band.
// If no clear row pattern is found, only vegetation cover is reported (weeds cannot be separated).

const { morph, regions } = require('./problem_areas');

function excessGreen(rgba, n, channels) {
    const exg = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += channels) {
        const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
        const s = r + g + b || 1;
        exg[i] = 2 * g / s - r / s - b / s;
    }
    return exg;
}

function otsu(values, lo = -1, hi = 2, bins = 256) {
    const hist = new Array(bins).fill(0);
    const scale = (bins - 1) / (hi - lo);
    for (const v of values) hist[Math.max(0, Math.min(bins - 1, Math.round((v - lo) * scale)))]++;
    const total = values.length;
    let sum = 0;
    hist.forEach((c, i) => { sum += i * c; });
    let sumB = 0, wB = 0, best = 0, bestT = 0;
    for (let t = 0; t < bins; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) ** 2;
        if (between > best) { best = between; bestT = t; }
    }
    return lo + bestT / scale;
}

function profileAt(mask, w, h, angleDeg, binSize) {
    const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const diag = Math.hypot(w, h);
    const nb = Math.ceil(2 * diag / binSize) + 1;
    const prof = new Float64Array(nb);
    for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
            if (!mask[y * w + x]) continue;
            prof[Math.floor((x * c + y * s + diag) / binSize)]++;
        }
    }
    return { prof, c, s, diag };
}

function peakiness(prof) {
    let n = 0, sum = 0, sq = 0;
    for (const v of prof) { if (v > 0) { n++; sum += v; sq += v * v; } }
    if (n < 3) return 0;
    const mean = sum / n;
    return (sq / n - mean * mean) / (mean * mean || 1);  // coefficient of variation²
}

function smooth(prof, r) {
    const out = new Float64Array(prof.length);
    for (let i = 0; i < prof.length; i++) {
        let s = 0, k = 0;
        for (let j = -r; j <= r; j++) { const q = prof[i + j]; if (q !== undefined) { s += q; k++; } }
        out[i] = s / k;
    }
    return out;
}

/** Dominant spacing (bins) of a profile via autocorrelation. */
function rowPeriod(prof, minLag, maxLag) {
    const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
    let best = 0, bestLag = 0, var0 = 0;
    for (const v of prof) var0 += (v - mean) ** 2;
    for (let lag = minLag; lag <= maxLag; lag++) {
        let s = 0;
        for (let i = 0; i + lag < prof.length; i++) s += (prof[i] - mean) * (prof[i + lag] - mean);
        if (s > best) { best = s; bestLag = lag; }
    }
    return { lag: bestLag, strength: var0 ? best / var0 : 0 };
}

/**
 * Analyse raw RGBA pixels. Returns masks and summary numbers.
 */
/** Green-plant mask: Excess Green with an Otsu threshold, 3x3 opening. */
function vegetationMask(rgba, w, h, channels = 4, opts = {}) {
    const n = w * h;
    const exg = excessGreen(rgba, n, channels);
    const thr = Math.max(opts.minExg != null ? opts.minExg : 0.05, otsu(exg));
    let veg = new Uint8Array(n);
    for (let i = 0; i < n; i++) veg[i] = exg[i] > thr ? 1 : 0;
    veg = morph(morph(veg, w, h, 1, false), w, h, 1, true);
    let count = 0;
    for (const v of veg) count += v;
    return { exg, veg, threshold: thr, cover: count / n };
}

/**
 * Crop-row direction and positions from a vegetation mask.
 * Returns {found, angle (row direction, deg), c, s, diag, centresPx, periodPx} where a pixel's
 * offset across the rows is d = x*c + y*s and row k is centred at d = centresPx[k].
 */
function findRows(veg, w, h, opts = {}) {
    const binSize = Math.max(2, Math.round(Math.min(w, h) / 200));
    let best = null;
    for (let ang = 0; ang < 180; ang += 3) {
        const p = profileAt(veg, w, h, ang, binSize);
        const score = peakiness(smooth(p.prof, 1));
        if (!best || score > best.score) best = Object.assign({ score, ang }, p);
    }
    const prof = smooth(best.prof, 1);
    const period = rowPeriod(prof, Math.round(Math.min(w, h) * 0.04 / binSize), Math.round(Math.min(w, h) * 0.5 / binSize));
    const found = period.lag > 0 && period.strength > (opts.minRowStrength != null ? opts.minRowStrength : 0.25);
    if (!found) return { found: false };
    // Row centres: local maxima of the profile at least 0.6 x period apart
    const minGap = Math.max(1, Math.round(period.lag * 0.6));
    const maxV = Math.max(...prof);
    const centres = [];
    for (let i = 1; i < prof.length - 1; i++) {
        if (prof[i] < maxV * 0.2 || prof[i] < prof[i - 1] || prof[i] < prof[i + 1]) continue;
        if (centres.length && i - centres[centres.length - 1] < minGap) {
            if (prof[i] > prof[centres[centres.length - 1]]) centres[centres.length - 1] = i;
            continue;
        }
        centres.push(i);
    }
    return {
        found: true, angle: (best.ang + 90) % 180, c: best.c, s: best.s, diag: best.diag,
        centresPx: centres.map(i => (i + 0.5) * binSize - best.diag), periodPx: period.lag * binSize
    };
}

/** Distance (px) across the rows from point (x,y) to the nearest row centre line. */
function rowDistance(rows, x, y) {
    const d = x * rows.c + y * rows.s;
    let best = Infinity;
    for (const c of rows.centresPx) { const v = Math.abs(d - c); if (v < best) best = v; }
    return best;
}

function analyzePixels(rgba, w, h, channels = 4, opts = {}) {
    const n = w * h;
    const vm = vegetationMask(rgba, w, h, channels, opts);
    const veg = vm.veg;
    const result = { width: w, height: h, vegetationCover: vm.cover, rowsDetected: false, rowAngle: null, rowSpacingPx: null, weedCover: null, weedPatches: [] };
    if (vm.cover < 0.002) return Object.assign(result, { veg, weeds: new Uint8Array(n), crop: new Uint8Array(n) });
    const rows = findRows(veg, w, h, opts);
    if (!rows.found) return Object.assign(result, { veg, weeds: new Uint8Array(n), crop: veg });
    const best = { c: rows.c, s: rows.s };
    const halfBand = (opts.rowBandFraction != null ? opts.rowBandFraction : 0.3) * rows.periodPx;

    const weeds = new Uint8Array(n), crop = new Uint8Array(n);
    const centresPx = rows.centresPx;
    let weedCount = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!veg[i]) continue;
            const d = x * best.c + y * best.s;
            let near = false;
            for (const c of centresPx) { if (Math.abs(d - c) <= halfBand) { near = true; break; } }
            if (near) crop[i] = 1; else { weeds[i] = 1; weedCount++; }
        }
    }
    const minPatch = Math.max(6, Math.round(n * 0.00005));
    const patches = regions(weeds, w, h).filter(r => r.count >= minPatch)
        .sort((a, b) => b.count - a.count)
        .map(r => ({ x: r.cx, y: r.cy, pixels: r.count }));

    return Object.assign(result, {
        rowsDetected: true,
        // profile angle is the row normal; rows run perpendicular to it
        rowAngle: rows.angle,
        rowSpacingPx: rows.periodPx,
        weedCover: weedCount / n,
        weedPatches: patches,
        veg, weeds, crop
    });
}

/**
 * Analyse a photo file; writes <outDir>/<name>_weeds.jpg (overlay) and <name>_mask.png.
 * Weeds are purple (as in CoFly's original output), crop rows tinted green.
 */
async function analyzePhoto(file, outDir, opts = {}) {
    const sharp = require('sharp');
    const fs = require('fs');
    const path = require('path');
    const { loadRGBA } = require('./indices');
    fs.mkdirSync(outDir, { recursive: true });
    const img = await loadRGBA(file, opts.maxSize || 1200);
    const res = analyzePixels(img.data, img.width, img.height, img.channels, opts);

    const overlay = Buffer.from(img.data);
    const mask = Buffer.alloc(img.width * img.height);
    for (let i = 0; i < img.width * img.height; i++) {
        const p = i * img.channels;
        if (res.weeds[i]) {
            overlay[p] = Math.round(overlay[p] * 0.35 + 150 * 0.65);
            overlay[p + 1] = Math.round(overlay[p + 1] * 0.35 + 10 * 0.65);
            overlay[p + 2] = Math.round(overlay[p + 2] * 0.35 + 150 * 0.65);
            mask[i] = 255;
        } else if (res.crop[i]) {
            overlay[p + 1] = Math.min(255, overlay[p + 1] + 40);
            mask[i] = 100;
        }
    }
    const base = path.basename(file).replace(/\.[^.]+$/, '');
    const overlayFile = path.join(outDir, base + '_weeds.jpg');
    const maskFile = path.join(outDir, base + '_mask.png');
    await sharp(overlay, { raw: { width: img.width, height: img.height, channels: img.channels } }).jpeg({ quality: 85 }).toFile(overlayFile);
    await sharp(mask, { raw: { width: img.width, height: img.height, channels: 1 } }).png().toFile(maskFile);

    return {
        photo: path.basename(file),
        overlay: overlayFile,
        mask: maskFile,
        vegetationCover: res.vegetationCover,
        weedCover: res.weedCover,
        rowsDetected: res.rowsDetected,
        rowAngle: res.rowAngle,
        weedPatches: res.weedPatches.slice(0, 50).map(p => ({ x: p.x / img.width, y: p.y / img.height, pixels: p.pixels }))
    };
}

module.exports = { analyzePixels, analyzePhoto, excessGreen, otsu, vegetationMask, findRows, rowDistance };
