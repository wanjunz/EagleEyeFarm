// RGB vegetation indices (crop health) for Potensic Atom 2 photos and orthophotos.
// Same formulas and display-range rule as CoFly's Vegetation-Indices module (MIT), reimplemented
// in JS so it runs on macOS/Windows/Linux without GDAL or the old Windows .exe.
//
//   VARI  = (G - R) / (G + R - B)      Visible Atmospherically Resistant Index
//   GLI   = (2G - R - B) / (2G + R + B) Green Leaf Index
//   NGRDI = (G - R) / (G + R)           Normalized Green-Red Difference Index
//   NGBDI = (G - B) / (G + B)           Normalized Green-Blue Difference Index
// All clipped to [-1, 1]. Higher = greener / healthier vegetation.

const INDICES = {
    VARI: (r, g, b) => (g - r) / (g + r - b + 1e-5),
    GLI: (r, g, b) => (2 * g - r - b) / (2 * g + r + b + 1e-5),
    NGRDI: (r, g, b) => (g - r) / (g + r + 1e-5),
    NGBDI: (r, g, b) => (g - b) / (g + b + 1e-5)
};

const INDEX_INFO = {
    VARI: 'Visible Atmospherically Resistant Index: greenness, less sensitive to haze',
    GLI: 'Green Leaf Index: leaf and canopy cover',
    NGRDI: 'Normalized Green-Red Difference: green vs. soil / stressed (yellow-red) plants',
    NGBDI: 'Normalized Green-Blue Difference: separates vegetation from soil and water'
};

/**
 * Compute one index for an RGBA buffer. Pixels with alpha 0 (outside the orthophoto) become NaN.
 * @returns Float32Array (width*height)
 */
function computeIndex(name, rgba, width, height, channels = 4) {
    const fn = INDICES[name];
    if (!fn) throw new Error('Unknown index ' + name);
    const out = new Float32Array(width * height);
    for (let i = 0, p = 0; i < out.length; i++, p += channels) {
        if (channels === 4 && rgba[p + 3] === 0) { out[i] = NaN; continue; }
        const v = fn(rgba[p], rgba[p + 1], rgba[p + 2]);
        out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
    return out;
}

/**
 * Display range, as in CoFly's find_real_min_max: 100 bins over [-1,1]; keep bins holding more
 * than 5% of valid pixels; range = [first, last] kept bin edge. Falls back to the 2nd-98th
 * percentile when no bin is that full (very uniform or very noisy images).
 */
function displayRange(values) {
    const bins = new Array(100).fill(0);
    let n = 0;
    for (const v of values) {
        if (Number.isNaN(v)) continue;
        bins[Math.min(99, Math.floor((v + 1) / 2 * 100))]++;
        n++;
    }
    if (!n) return [-1, 1];
    const kept = bins.map((c, i) => (c > 0.05 * n ? i : -1)).filter(i => i >= 0);
    if (kept.length >= 2) return [kept[0] / 50 - 1, (kept[kept.length - 1] + 1) / 50 - 1];
    let acc = 0, lo = null, hi = null;
    for (let i = 0; i < 100; i++) {
        acc += bins[i];
        if (lo === null && acc >= 0.02 * n) lo = i / 50 - 1;
        if (hi === null && acc >= 0.98 * n) hi = (i + 1) / 50 - 1;
    }
    return lo < hi ? [lo, hi] : [lo - 0.05, hi + 0.05];
}

// matplotlib RdYlGn (red = low / stressed, green = high / healthy)
const RDYLGN = [
    [165, 0, 38], [215, 48, 39], [244, 109, 67], [253, 174, 97], [254, 224, 139], [255, 255, 191],
    [217, 239, 139], [166, 217, 106], [102, 189, 99], [26, 152, 80], [0, 104, 55]
];

function colorFor(t) {
    const x = Math.max(0, Math.min(1, t)) * (RDYLGN.length - 1);
    const i = Math.min(RDYLGN.length - 2, Math.floor(x)), f = x - i;
    const a = RDYLGN[i], b = RDYLGN[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Colour an index map with RdYlGn over [lo, hi]. NaN pixels are transparent. */
function colorize(values, range) {
    const [lo, hi] = range;
    const out = Buffer.alloc(values.length * 4);
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (Number.isNaN(v)) continue;
        const c = colorFor((v - lo) / (hi - lo || 1));
        out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    }
    return out;
}

function stats(values, range) {
    const thr = range[0] + (range[1] - range[0]) * 0.25;
    let n = 0, sum = 0, low = 0;
    for (const v of values) {
        if (Number.isNaN(v)) continue;
        n++; sum += v;
        if (v < thr) low++;
    }
    return { mean: n ? sum / n : null, lowFraction: n ? low / n : 0, validPixels: n };
}

/**
 * Load an image (JPEG/PNG/TIFF) as RGBA, downscaled so the long side is at most maxSize.
 */
async function loadRGBA(file, maxSize = 1600) {
    const sharp = require('sharp');
    const img = sharp(file, { limitInputPixels: false }).ensureAlpha();
    const meta = await sharp(file, { limitInputPixels: false }).metadata();
    const scale = Math.min(1, maxSize / Math.max(meta.width, meta.height));
    const { data, info } = await img
        .resize(Math.round(meta.width * scale), Math.round(meta.height * scale), { kernel: 'linear' })
        .raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels, origWidth: meta.width, origHeight: meta.height };
}

/** Index values for an image file (no output files). */
async function indexMaps(file, opts = {}) {
    const img = await loadRGBA(file, opts.maxSize);
    const maps = {};
    for (const name of opts.indices || Object.keys(INDICES)) maps[name] = computeIndex(name, img.data, img.width, img.height, img.channels);
    return { width: img.width, height: img.height, maps };
}

async function writeColorPng(values, width, height, range, file) {
    const sharp = require('sharp');
    await sharp(colorize(values, range), { raw: { width, height, channels: 4 } }).png().toFile(file);
    return file;
}

/** Display range over several maps (sub-sampled), so photos of one field share one colour scale. */
function sharedRange(valueArrays) {
    const sample = [];
    for (const v of valueArrays) {
        const step = Math.max(1, Math.floor(v.length / 20000));
        for (let i = 0; i < v.length; i += step) sample.push(v[i]);
    }
    return displayRange(Float32Array.from(sample));
}

/**
 * Compute all four indices for an image and write <outDir>/<prefix><INDEX>.png colour maps.
 * opts.ranges = {INDEX: [lo,hi]} forces a colour range (used to give all photos one scale).
 * @returns {Promise<{width,height,indices:{[name]:{png,range,mean,lowFraction,values}}}>}
 */
async function analyzeImage(file, outDir, opts = {}) {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(outDir, { recursive: true });
    const im = opts.maps || await indexMaps(file, opts);
    const result = { width: im.width, height: im.height, indices: {} };
    for (const name of Object.keys(im.maps)) {
        const values = im.maps[name];
        const range = (opts.ranges && opts.ranges[name]) || displayRange(values);
        const png = await writeColorPng(values, im.width, im.height, range, path.join(outDir, (opts.prefix || '') + name + '.png'));
        result.indices[name] = Object.assign({ png, range, values }, stats(values, range));
    }
    return result;
}

module.exports = { INDICES, INDEX_INFO, computeIndex, displayRange, sharedRange, colorize, colorFor, stats, loadRGBA, indexMaps, writeColorPng, analyzeImage, RDYLGN };
