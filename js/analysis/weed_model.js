// Trained weed detector for close-range RGB crop photos.
//
// The image is divided into small square cells (~1/40 of the image width). For every cell we compute
// colour, texture and crop-row features plus the same features averaged over its neighbourhood. Two
// gradient-boosted tree ensembles (trained offline on CoFly-WeedDB, Greek cotton, CC-BY-4.0; see
// tools/train_weed_model.py) give the probability that the cell is part of a weed cluster: stage 2
// also sees stage 1's probabilities over the surrounding cells ("auto-context").
// Everything here is plain JS so it runs in the Electron app with no TensorFlow/Python.

const fs = require('fs');
const path = require('path');
const { vegetationMask, findRows, rowDistance } = require('./weeds');

const MODEL_FILE = path.join(__dirname, 'models', 'weed_gbt.json');
const GRID_COLS = 40;           // cells across the image width

const BASE = ['v', 'v_sd', 'exg', 'exg_sd', 'exr', 'sat', 'sat_sd', 'grad', 'grad_sd', 'rn', 'gn', 'bn',
    'veg', 'edge', 'v_rel', 'exg_rel', 'dark', 'bright'];
const CONTEXT = ['veg', 'exg', 'grad', 'v_rel', 'sat', 'exr', 'edge'];
const FEATURE_NAMES = BASE.concat(['row_dist', 'rows_found'])
    .concat(CONTEXT.map(n => n + '_n3')).concat(CONTEXT.map(n => n + '_n7'))
    .concat(['veg_n3_minus_self', 'grad_n7_minus_self']);

function median(values, step = 7) {
    const s = [];
    for (let i = 0; i < values.length; i += step) s.push(values[i]);
    s.sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] || 0;
}

/**
 * Cell features for an RGBA image.
 * @returns {{cols, rows, cell, F, data: Float32Array(cols*rows*F), names}}
 */
function cellFeatures(rgba, w, h, channels = 4) {
    const n = w * h;
    const cell = Math.max(4, Math.round(w / GRID_COLS));
    const cols = Math.floor(w / cell), rows = Math.floor(h / cell);
    const v = new Float32Array(n), exr = new Float32Array(n), sat = new Float32Array(n), lum = new Float32Array(n);
    const rn = new Float32Array(n), gn = new Float32Array(n), bn = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += channels) {
        const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2], s = r + g + b + 1;
        rn[i] = r / s; gn[i] = g / s; bn[i] = b / s;
        v[i] = (r + g + b) / 765;
        exr[i] = 1.4 * rn[i] - gn[i];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        sat[i] = (mx - mn) / (mx + 1);
        lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    const vm = vegetationMask(rgba, w, h, channels);
    const exg = vm.exg;
    const rowsInfo = vm.cover > 0.002 ? findRows(vm.veg, w, h) : { found: false };
    const vMed = median(v), exgMed = median(exg);

    const nb = BASE.length;
    const base = new Float32Array(cols * rows * nb);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            let sv = 0, sv2 = 0, se = 0, se2 = 0, sr = 0, ss = 0, ss2 = 0, sg = 0, sg2 = 0, srn = 0, sgn = 0, sbn = 0, sveg = 0, sedge = 0, sdark = 0, sbright = 0, k = 0;
            for (let y = cy * cell; y < (cy + 1) * cell; y++) {
                for (let x = cx * cell; x < (cx + 1) * cell; x++) {
                    const i = y * w + x;
                    const gx = x + 1 < w ? Math.abs(lum[i + 1] - lum[i]) : 0;
                    const gy = y + 1 < h ? Math.abs(lum[i + w] - lum[i]) : 0;
                    const gr = gx + gy;
                    sv += v[i]; sv2 += v[i] * v[i]; se += exg[i]; se2 += exg[i] * exg[i]; sr += exr[i];
                    ss += sat[i]; ss2 += sat[i] * sat[i]; sg += gr; sg2 += gr * gr;
                    srn += rn[i]; sgn += gn[i]; sbn += bn[i]; sveg += vm.veg[i];
                    if (gr > 40) sedge++;
                    if (v[i] < vMed - 0.15) sdark++;
                    if (v[i] > vMed + 0.15) sbright++;
                    k++;
                }
            }
            const sd = (s1, s2) => Math.sqrt(Math.max(0, s2 / k - (s1 / k) ** 2));
            const o = (cy * cols + cx) * nb;
            const f = [sv / k, sd(sv, sv2), se / k, sd(se, se2), sr / k, ss / k, sd(ss, ss2), sg / k / 100, sd(sg, sg2) / 100,
                srn / k, sgn / k, sbn / k, sveg / k, sedge / k, sv / k - vMed, se / k - exgMed, sdark / k, sbright / k];
            for (let j = 0; j < nb; j++) base[o + j] = f[j];
        }
    }

    // neighbourhood means of selected base features over 3x3 and 7x7 cells
    const ctxIdx = CONTEXT.map(c => BASE.indexOf(c));
    const boxMean = (j, r, cx, cy) => {
        let s = 0, k = 0;
        for (let y = Math.max(0, cy - r); y <= Math.min(rows - 1, cy + r); y++)
            for (let x = Math.max(0, cx - r); x <= Math.min(cols - 1, cx + r); x++) { s += base[(y * cols + x) * nb + j]; k++; }
        return s / k;
    };
    const F = FEATURE_NAMES.length;
    const data = new Float32Array(cols * rows * F);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            const c = cy * cols + cx, o = c * F;
            for (let j = 0; j < nb; j++) data[o + j] = base[c * nb + j];
            let q = nb;
            data[o + q++] = rowsInfo.found ? Math.min(0.5, rowDistance(rowsInfo, (cx + 0.5) * cell, (cy + 0.5) * cell) / rowsInfo.periodPx) : -1;
            data[o + q++] = rowsInfo.found ? 1 : 0;
            const n3 = ctxIdx.map(j => boxMean(j, 1, cx, cy)), n7 = ctxIdx.map(j => boxMean(j, 3, cx, cy));
            n3.forEach(val => { data[o + q++] = val; });
            n7.forEach(val => { data[o + q++] = val; });
            data[o + q++] = n3[0] - base[c * nb + BASE.indexOf('veg')];
            data[o + q++] = n7[2] - base[c * nb + BASE.indexOf('grad')];
        }
    }
    return { cols, rows, cell, F, data, names: FEATURE_NAMES, rowsInfo, vegCover: vm.cover, veg: vm.veg };
}

let cachedModel = null;
function loadModel(file = MODEL_FILE) {
    if (cachedModel && cachedModel.file === file) return cachedModel.model;
    if (!fs.existsSync(file)) return null;
    const model = JSON.parse(fs.readFileSync(file, 'utf8'));
    cachedModel = { file, model };
    return model;
}

/** Gradient-boosted trees (exported from scikit-learn HistGradientBoostingClassifier). */
function predictProba(ensemble, row) {
    let raw = ensemble.baseline;
    for (const t of ensemble.trees) {
        let k = 0;
        while (!t.leaf[k]) k = row[t.feature[k]] <= t.threshold[k] ? t.left[k] : t.right[k];
        raw += t.value[k];
    }
    return 1 / (1 + Math.exp(-raw));
}

/**
 * Weed-cluster probability per cell, smoothed over 3x3 cells.
 * @returns {{cols, rows, cell, prob: Float32Array, threshold}}
 */
function predictCells(rgba, w, h, channels = 4, model = loadModel()) {
    if (!model) throw new Error('Weed model file missing: ' + MODEL_FILE);
    const fe = cellFeatures(rgba, w, h, channels);
    if (model.featureNames.join() !== fe.names.join()) throw new Error('Weed model does not match the feature extractor version.');
    const nCells = fe.cols * fe.rows;
    const p1 = new Float32Array(nCells);
    for (let c = 0; c < nCells; c++) p1[c] = predictProba(model.stage1, fe.data.subarray(c * fe.F, (c + 1) * fe.F));
    // stage-1 context: mean over 3x3, 7x7, 15x15 and max over 7x7 (edges replicated, as in training)
    const at = (x, y) => p1[Math.min(fe.rows - 1, Math.max(0, y)) * fe.cols + Math.min(fe.cols - 1, Math.max(0, x))];
    const boxMean = (cx, cy, r) => { let s = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) s += at(x, y); return s / ((2 * r + 1) ** 2); };
    const boxMax = (cx, cy, r) => { let m = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) m = Math.max(m, at(x, y)); return m; };
    const raw = new Float32Array(nCells);
    const row2 = new Float32Array(fe.F + 5);
    for (let c = 0; c < nCells; c++) {
        const cx = c % fe.cols, cy = (c - cx) / fe.cols;
        row2.set(fe.data.subarray(c * fe.F, (c + 1) * fe.F));
        row2[fe.F] = p1[c]; row2[fe.F + 1] = boxMean(cx, cy, 1); row2[fe.F + 2] = boxMean(cx, cy, 3);
        row2[fe.F + 3] = boxMean(cx, cy, 7); row2[fe.F + 4] = boxMax(cx, cy, 3);
        raw[c] = predictProba(model.stage2, row2);
    }
    const prob = new Float32Array(raw.length);
    for (let cy = 0; cy < fe.rows; cy++) for (let cx = 0; cx < fe.cols; cx++) {
        let s = 0, k = 0;
        for (let y = Math.max(0, cy - 1); y <= Math.min(fe.rows - 1, cy + 1); y++)
            for (let x = Math.max(0, cx - 1); x <= Math.min(fe.cols - 1, cx + 1); x++) { s += raw[y * fe.cols + x]; k++; }
        prob[cy * fe.cols + cx] = model.smooth ? s / k : raw[cy * fe.cols + cx];
    }
    return { cols: fe.cols, rows: fe.rows, cell: fe.cell, prob, threshold: model.threshold, fe };
}

/** Pixel weed mask (1 = weed cluster) for an RGBA image. */
function predictMask(rgba, w, h, channels = 4, model = loadModel()) {
    const p = predictCells(rgba, w, h, channels, model);
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const cy = Math.min(p.rows - 1, Math.floor(y / p.cell));
        for (let x = 0; x < w; x++) {
            const cx = Math.min(p.cols - 1, Math.floor(x / p.cell));
            mask[y * w + x] = p.prob[cy * p.cols + cx] >= p.threshold ? 1 : 0;
        }
    }
    return mask;
}

module.exports = { cellFeatures, predictProba, predictCells, predictMask, loadModel, FEATURE_NAMES, MODEL_FILE, GRID_COLS };
