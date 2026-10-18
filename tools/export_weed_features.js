// Export per-cell weed features + labels from CoFly-WeedDB for training (tools/train_weed_model.py).
// usage: node tools/export_weed_features.js <CoFly-WeedDB dir> <out dir>
// Uses the exact feature code the app runs (js/analysis/weed_model.js), so training and use match.
const fs = require('fs'), path = require('path');
const sharp = require('sharp');
const { cellFeatures, FEATURE_NAMES } = require('../js/analysis/weed_model');

const [db, out] = process.argv.slice(2);
const W = 1280, H = 720;

(async () => {
    fs.mkdirSync(out, { recursive: true });
    const have = new Set(fs.readdirSync(path.join(db, 'images')));
    const names = fs.readdirSync(path.join(db, 'labels_1d')).filter(f => have.has(f)).sort();
    const X = [], meta = [];
    for (let k = 0; k < names.length; k++) {
        const f = names[k];
        const img = await sharp(path.join(db, 'images', f)).resize(W, H).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const lab = await sharp(path.join(db, 'labels_1d', f)).resize(W, H, { kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
        const fe = cellFeatures(img.data, W, H, img.info.channels);
        for (let c = 0; c < fe.cols * fe.rows; c++) {
            const cx = c % fe.cols, cy = (c - cx) / fe.cols;
            let weed = 0, n = 0;
            for (let y = cy * fe.cell; y < (cy + 1) * fe.cell; y++)
                for (let x = cx * fe.cell; x < (cx + 1) * fe.cell; x++) { weed += lab.data[(y * W + x) * lab.info.channels] > 0 ? 1 : 0; n++; }
            X.push(Float32Array.from(fe.data.subarray(c * fe.F, (c + 1) * fe.F)));
            meta.push([k, cx, cy, weed / n]);
        }
        if (k % 20 === 0) console.log(k + 1, '/', names.length);
    }
    const F = FEATURE_NAMES.length;
    const buf = new Float32Array(X.length * F);
    X.forEach((r, i) => buf.set(r, i * F));
    fs.writeFileSync(path.join(out, 'X.f32'), Buffer.from(buf.buffer));
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ images: names, features: FEATURE_NAMES, cells: meta }));
    console.log('cells', X.length, 'features', F);
})();
