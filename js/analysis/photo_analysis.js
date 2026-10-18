// Analyse one drone photo: crop health (vegetation indices + problem areas) and weeds (trained model).
// Used for every photo of a field scan, for close-ups, and for the single what3words photo.

const fs = require('fs');
const path = require('path');
const indices = require('./indices');
const problems = require('./problem_areas');
const weedModel = require('./weed_model');
const { photoPixelToLatLng } = require('./mosaic');
const fieldSummary = require('./field_summary');

// The weed model was trained on 1280x720 photos covering ~7.5 m of ground (CoFly-WeedDB, 5 m height).
const TRAIN_WINDOW_M = 7.5;
const TRAIN_W = 1280, TRAIN_H = 720;
// Above ~2 cm per pixel, seedlings and small weeds are only a few pixels wide.
const MAX_WEED_GSD_M = 0.02;

/** Load a photo as RGBA, long side limited to maxSize. */
async function loadRGBA(file, maxSize) {
    return indices.loadRGBA(file, maxSize);
}

/**
 * Weed-cluster probability grid for a photo covering widthM metres. Large photos are cut into windows
 * of ~7.5 m (the training scale), each resized to 1280x720 like the training images.
 * @returns {{grid: Float32Array, gcols, grows, gsd, tooHigh, threshold}}
 */
async function weedGrid(source, widthM, opts = {}) {
    const sharp = require('sharp');
    // source: a photo file, or an image already in memory {data, width, height, channels}
    const img = typeof source === 'string' ? await loadRGBA(source, opts.maxSize || 4000) : source;
    const gsd = widthM / img.width;
    const model = weedModel.loadModel();
    if (!model) throw new Error('Weed model missing (js/analysis/models/weed_gbt.json).');
    const winW = Math.min(img.width, Math.max(64, Math.round(TRAIN_WINDOW_M / gsd)));
    const winH = Math.min(img.height, Math.round(winW * TRAIN_H / TRAIN_W));
    const nx = Math.max(1, Math.round(img.width / winW)), ny = Math.max(1, Math.round(img.height / winH));
    const cellsX = weedModel.GRID_COLS, cellsY = Math.floor(TRAIN_H / Math.round(TRAIN_W / weedModel.GRID_COLS));
    const gcols = nx * cellsX, grows = ny * cellsY;
    const grid = new Float32Array(gcols * grows);
    for (let wy = 0; wy < ny; wy++) {
        for (let wx = 0; wx < nx; wx++) {
            const left = Math.round(wx * img.width / nx), top = Math.round(wy * img.height / ny);
            const w = Math.round((wx + 1) * img.width / nx) - left, h = Math.round((wy + 1) * img.height / ny) - top;
            const win = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels } })
                .extract({ left, top, width: w, height: h }).resize(TRAIN_W, TRAIN_H, { fit: 'fill' }).raw().toBuffer();
            const p = weedModel.predictCells(win, TRAIN_W, TRAIN_H, img.channels, model);
            for (let cy = 0; cy < p.rows; cy++) for (let cx = 0; cx < p.cols; cx++) {
                grid[(wy * cellsY + cy) * gcols + wx * cellsX + cx] = p.prob[cy * p.cols + cx];
            }
        }
    }
    return { grid, gcols, grows, gsd, tooHigh: gsd > MAX_WEED_GSD_M, threshold: model.threshold, maxHeightHint: null };
}

/** Transparent overlay (purple = likely weeds) at size w x h from a weed grid. */
function weedOverlay(g, w, h) {
    const out = Buffer.alloc(w * h * 4);
    let flagged = 0;
    for (let y = 0; y < h; y++) {
        const gy = Math.min(g.grows - 1, Math.floor(y / h * g.grows));
        for (let x = 0; x < w; x++) {
            const gx = Math.min(g.gcols - 1, Math.floor(x / w * g.gcols));
            if (g.grid[gy * g.gcols + gx] >= g.threshold) {
                const p = (y * w + x) * 4;
                out[p] = 170; out[p + 1] = 20; out[p + 2] = 190; out[p + 3] = 150;
                flagged++;
            }
        }
    }
    return { data: out, cover: flagged / (w * h) };
}

/** Weed patches (grid cell groups) as photo-relative pixel centres, largest first. */
function weedPatches(g, w, h) {
    const mask = new Uint8Array(g.grid.length);
    for (let i = 0; i < mask.length; i++) mask[i] = g.grid[i] >= g.threshold ? 1 : 0;
    return problems.regions(mask, g.gcols, g.grows).sort((a, b) => b.count - a.count)
        .map(r => ({ x: (r.cx + 0.5) / g.gcols * w, y: (r.cy + 0.5) / g.grows * h, cells: r.count }));
}

/** Resize a raw RGBA image so its long side is at most maxSize (or by a fixed scale, if given). */
async function shrink(img, maxSize, fixedScale) {
    const sharp = require('sharp');
    const scale = fixedScale || Math.min(1, maxSize / Math.max(img.width, img.height));
    if (scale >= 1) return img;
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    const data = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels } })
        .resize(w, h, { fit: 'fill', kernel: 'linear' }).raw().toBuffer();
    return { data, width: w, height: h, channels: img.channels };
}

/**
 * Analyse an image already in memory: a photo, or one tile of a structure-from-motion orthomosaic.
 * full = {data, width, height, channels} at full resolution (used for weeds); maps and overlays are
 * made at opts.maxSize (default 900 px). tile = {lat, lng, heading, widthM, heightM} (lat/lng may be null).
 * Writes <base>_<INDEX>.png, <base>_weeds.png and, unless opts.photoJpg === false, <base>_weeds.jpg;
 * with opts.photoPng, also <base>_photo.png (used to stitch orthomosaic tiles).
 */
async function analyzeRaster(full, outDir, base, tile, opts = {}) {
    const sharp = require('sharp');
    fs.mkdirSync(outDir, { recursive: true });
    // opts.scale: one scale for every tile of an orthomosaic, so the tiles line up when joined
    const small = await shrink(full, opts.maxSize || 900, opts.scale);
    const W = small.width, H = small.height;
    const maps = { width: W, height: H, maps: {} };
    for (const n of Object.keys(indices.INDICES)) maps.maps[n] = indices.computeIndex(n, small.data, W, H, small.channels);
    const health = await indices.analyzeImage(null, outDir, { prefix: base + '_', maps, ranges: opts.ranges });

    const metresPerPx = tile.widthM / W;
    const out = { width: W, height: H, health: {}, problems: {}, files: {} };
    let gliMask = null;
    for (const n of Object.keys(health.indices)) {
        const r = health.indices[n];
        const det = detectProblems(r.values, W, H, r.range, metresPerPx);
        if (n === 'GLI') gliMask = det.mask;
        let flagged = 0;
        for (const m of det.mask) flagged += m;
        let valid = 0;
        for (const v of r.values) if (!Number.isNaN(v)) valid++;
        out.health[n] = { mean: r.mean, problemFraction: valid ? flagged / valid : 0, range: r.range, validFraction: valid / (W * H) };
        out.files[n] = path.basename(r.png);
        out.problems[n] = det.points.map(p => Object.assign(
            tile.lat != null ? photoPixelToLatLng(tile, p.x, p.y, W, H) : {},
            { x: p.x / W, y: p.y / H, areaM2: p.weight * metresPerPx * metresPerPx }));
    }

    // per-area numbers for the field summary (crop cover, plant greenness, stressed/bare share)
    out.cells = fieldSummary.cellStats(small.data, W, H, small.channels, maps.maps.GLI, gliMask, tile);

    const g = await weedGrid(full, tile.widthM);
    const ov = weedOverlay(g, W, H);
    // no-data (transparent) parts of an orthomosaic tile never count as weeds
    let validPx = W * H, weedPx = 0;
    if (small.channels === 4) {
        validPx = 0;
        for (let i = 0; i < W * H; i++) {
            if (small.data[i * 4 + 3] === 0) { ov.data[i * 4 + 3] = 0; continue; }
            validPx++;
            if (ov.data[i * 4 + 3]) weedPx++;
        }
        ov.cover = validPx ? weedPx / validPx : 0;
    }
    await sharp(ov.data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(path.join(outDir, base + '_weeds.png'));
    if (opts.photoPng) {
        await sharp(small.data, { raw: { width: W, height: H, channels: small.channels } }).png().toFile(path.join(outDir, base + '_photo.png'));
        out.files.photo = base + '_photo.png';
    }
    if (opts.photoJpg !== false) {
        const photo = Buffer.from(small.channels === 4 ? small.data : await sharp(small.data, { raw: { width: W, height: H, channels: small.channels } }).ensureAlpha().raw().toBuffer());
        for (let i = 0; i < W * H; i++) {
            const a = ov.data[i * 4 + 3] / 255;
            if (!a) continue;
            for (let c = 0; c < 3; c++) photo[i * 4 + c] = Math.round(photo[i * 4 + c] * (1 - a) + ov.data[i * 4 + c] * a);
        }
        await sharp(photo, { raw: { width: W, height: H, channels: 4 } }).jpeg({ quality: 85 }).toFile(path.join(outDir, base + '_weeds.jpg'));
        out.files.weedsPhoto = base + '_weeds.jpg';
    }
    out.files.weeds = base + '_weeds.png';
    out.validFraction = validPx / (W * H);
    out.weeds = {
        cover: ov.cover, gsdCm: +(g.gsd * 100).toFixed(2), tooHigh: g.tooHigh,
        patches: weedPatches(g, W, H).slice(0, 30).map(p => Object.assign(
            tile.lat != null ? photoPixelToLatLng(tile, p.x, p.y, W, H) : {},
            { x: p.x / W, y: p.y / H }))
    };
    return out;
}

/**
 * Full analysis of one photo file. tile = {lat, lng, heading, widthM, heightM} (lat/lng may be null).
 * opts.ranges: shared colour ranges per index (field scans); otherwise each photo uses its own.
 * Writes into outDir: <base>_<INDEX>.png, <base>_weeds.png (transparent), <base>_weeds.jpg (photo + weeds).
 */
async function analyzePhoto(file, outDir, tile, opts = {}) {
    const base = path.basename(file).replace(/\.[^.]+$/, '');
    const full = await loadRGBA(file, opts.fullSize || 4000);
    const out = await analyzeRaster(full, outDir, base, tile, opts);
    return Object.assign({ photo: path.basename(file) }, out);
}

/** Problem-area detection with the app's ground-scale settings (1.5 m smoothing, 1 m² minimum, 4 m merge). */
function detectProblems(values, width, height, range, metresPerPx) {
    return problems.detect(values, width, height, range, {
        blurRadius: Math.round(1.5 / metresPerPx),
        minPixels: Math.max(4, Math.round(1 / (metresPerPx * metresPerPx))),
        mergePixels: Math.round(4 / metresPerPx)
    });
}

/** Per-area summary numbers for one photo without the full analysis (used for older scans). */
async function photoCells(file, tile, gliRange) {
    const maps = await indices.indexMaps(file, { maxSize: 900, indices: ['GLI'] });
    const det = detectProblems(maps.maps.GLI, maps.width, maps.height, gliRange, tile.widthM / maps.width);
    const rgba = await indices.loadRGBA(file, 900);
    return fieldSummary.cellStats(rgba.data, rgba.width, rgba.height, rgba.channels, maps.maps.GLI, det.mask, tile);
}

/** Highest flight (m) at which a camera still gives ~2 cm/px, for the weed-check advice. */
function maxWeedHeight(hfovDeg, pixelWidth) {
    return MAX_WEED_GSD_M * pixelWidth / (2 * Math.tan(hfovDeg / 2 * Math.PI / 180));
}

module.exports = { analyzePhoto, analyzeRaster, shrink, photoCells, weedGrid, weedOverlay, maxWeedHeight, TRAIN_WINDOW_M, MAX_WEED_GSD_M };
