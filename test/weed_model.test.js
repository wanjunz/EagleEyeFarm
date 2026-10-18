// Regression test of the trained weed model on two real CoFly-WeedDB cotton photos (CC-BY-4.0).
// These photos were in the shipped model's training data: this checks the model + feature code still
// work together. Held-out accuracy is reported in the README (CoFly's test splits).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const sharp = require('sharp');
const wm = require('../js/analysis/weed_model');

const DIR = path.join(__dirname, 'fixtures', 'cofly_weeddb');

async function iou(id) {
    const img = await sharp(path.join(DIR, id + '.jpg')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const lab = await sharp(path.join(DIR, id + '_label.png')).raw().toBuffer({ resolveWithObject: true });
    const m = wm.predictMask(img.data, img.info.width, img.info.height, img.info.channels);
    let iW = 0, uW = 0, iB = 0, uB = 0;
    for (let k = 0; k < m.length; k++) {
        const g = lab.data[k * lab.info.channels] > 0, p = m[k] === 1;
        if (g && p) iW++; if (g || p) uW++;
        if (!g && !p) iB++; if (!g || !p) uB++;
    }
    return { weed: iW / uW, background: iB / uB };
}

test('model file loads and matches the feature extractor', () => {
    const model = wm.loadModel();
    assert.ok(model, 'js/analysis/models/weed_gbt.json missing');
    assert.deepStrictEqual(model.featureNames, wm.FEATURE_NAMES);
    assert.ok(model.stage1.trees.length > 50 && model.stage2.trees.length > 50);
    assert.ok(model.threshold > 0 && model.threshold < 1);
});

test('finds the expert-labelled weed patches in real cotton photos', async () => {
    for (const id of ['ID_00405', 'ID_00342']) {
        const r = await iou(id);
        assert.ok(r.weed > 0.3, id + ' weed IoU ' + r.weed.toFixed(3));
        assert.ok(r.background > 0.7, id + ' background IoU ' + r.background.toFixed(3));
    }
});

test('a bare-soil image has almost no weeds', async () => {
    const w = 640, h = 360, buf = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { buf[i * 4] = 170 + (i % 7); buf[i * 4 + 1] = 150 + (i % 5); buf[i * 4 + 2] = 120; buf[i * 4 + 3] = 255; }
    const m = wm.predictMask(buf, w, h, 4);
    let n = 0;
    for (const v of m) n += v;
    assert.ok(n / m.length < 0.05);
});
