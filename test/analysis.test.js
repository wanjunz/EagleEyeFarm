const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const indices = require('../js/analysis/indices');
const problems = require('../js/analysis/problem_areas');
const weeds = require('../js/analysis/weeds');

// Synthetic field image helpers (RGBA)
function image(w, h, fn) {
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const [r, g, b, a] = fn(x, y);
        const p = (y * w + x) * 4;
        buf[p] = r; buf[p + 1] = g; buf[p + 2] = b; buf[p + 3] = a == null ? 255 : a;
    }
    return buf;
}
const GREEN = [60, 160, 50], SOIL = [140, 110, 80], WEED = [70, 150, 45];

test('index formulas match CoFly (green high, soil low, clipped to [-1,1])', () => {
    const g = indices.INDICES, [r, gg, b] = GREEN, [sr, sg, sb] = SOIL;
    assert.ok(Math.abs(g.NGRDI(r, gg, b) - (gg - r) / (gg + r)) < 1e-4);
    assert.ok(g.GLI(r, gg, b) > 0 && g.GLI(sr, sg, sb) < 0.05);
    const vals = indices.computeIndex('VARI', Buffer.from([0, 255, 255, 255, 0, 0, 0, 0]), 2, 1);
    assert.ok(vals[0] >= -1 && vals[0] <= 1);
    assert.ok(Number.isNaN(vals[1]), 'alpha 0 = no data');
});

test('display range and colour map', () => {
    const vals = new Float32Array(1000).map((_, i) => (i < 500 ? -0.2 : 0.4));
    const [lo, hi] = indices.displayRange(vals);
    assert.ok(lo <= -0.2 && hi >= 0.4 && hi - lo < 0.7);
    assert.deepStrictEqual(indices.colorFor(0).map(Math.round), [165, 0, 38]);
    assert.deepStrictEqual(indices.colorFor(1).map(Math.round), [0, 104, 55]);
});

test('problem areas: finds two bare patches in a healthy field, at the right places', () => {
    const w = 200, h = 120;
    const px = image(w, h, (x, y) => {
        const inA = (x - 40) ** 2 + (y - 30) ** 2 < 15 ** 2;
        const inB = (x - 150) ** 2 + (y - 90) ** 2 < 12 ** 2;
        return inA || inB ? SOIL : GREEN;
    });
    const vals = indices.computeIndex('GLI', px, w, h);
    const res = problems.detect(vals, w, h, [-0.1, 0.45]);
    assert.strictEqual(res.points.length, 2);
    const pts = res.points.map(p => [Math.round(p.x), Math.round(p.y)]).sort((a, b) => a[0] - b[0]);
    assert.ok(Math.abs(pts[0][0] - 40) <= 1 && Math.abs(pts[0][1] - 30) <= 1, JSON.stringify(pts));
    assert.ok(Math.abs(pts[1][0] - 150) <= 1 && Math.abs(pts[1][1] - 90) <= 1, JSON.stringify(pts));
});

test('problem areas: no-data border is never flagged, nearby patches merge, separate ones stay separate', () => {
    const w = 300, h = 300;
    const px = image(w, h, (x, y) => {
        if (x < 20) return [0, 0, 0, 0];                       // outside orthophoto
        const patch = (x % 40 < 8) && (y % 40 < 8);
        return patch ? SOIL : GREEN;
    });
    const vals = indices.computeIndex('GLI', px, w, h);
    // 8x8 px patches every 40 px: merge distance 30 px keeps them separate, 50 px joins neighbours
    const apart = problems.detect(vals, w, h, [-0.1, 0.45], { minPixels: 20, mergePixels: 30, maxPoints: 100 });
    assert.strictEqual(apart.points.length, 7 * 8, 'one point per patch right of the no-data border');
    assert.ok(apart.points.every(p => p.x > 20));
    const joined = problems.detect(vals, w, h, [-0.1, 0.45], { minPixels: 20, mergePixels: 50 });
    assert.strictEqual(joined.points.length, 1);
});

test('pixelToLatLng uses x for longitude and y for latitude (bug in original fixed)', () => {
    const b = { north: 40, south: 39, east: 23, west: 22 };
    const p = problems.pixelToLatLng(99.5, 0, 100, 100, b);
    assert.ok(Math.abs(p.lng - 23) < 0.01 && Math.abs(p.lat - 39.995) < 0.01);
});

test('weeds: vegetation between crop rows is flagged as weed, rows are not', () => {
    const w = 400, h = 300;
    const px = image(w, h, (x, y) => {
        const inRow = Math.abs((x % 60) - 30) < 7;                    // vertical crop rows every 60 px
        const weed = (x - 60) ** 2 + (y - 150) ** 2 < 9 ** 2;          // weed between rows (row gap at x=60)
        return inRow ? GREEN : weed ? WEED : SOIL;
    });
    const res = weeds.analyzePixels(px, w, h, 4);
    assert.ok(res.rowsDetected, 'rows should be detected');
    assert.ok(Math.abs(res.rowAngle - 90) <= 6 || Math.abs(res.rowAngle - 90) >= 174, 'vertical rows, got ' + res.rowAngle);
    assert.ok(Math.abs(res.rowSpacingPx - 60) <= 8, 'spacing ≈ 60px, got ' + res.rowSpacingPx);
    assert.ok(res.weedPatches.length >= 1);
    const top = res.weedPatches[0];
    assert.ok(Math.abs(top.x - 60) < 6 && Math.abs(top.y - 150) < 6, JSON.stringify(top));
    assert.ok(res.weedCover > 0 && res.weedCover < 0.01);
    assert.ok(res.vegetationCover > 0.2);
});

test('weeds: bare soil gives zero vegetation and no crash', () => {
    const res = weeds.analyzePixels(image(100, 100, () => SOIL), 100, 100, 4);
    assert.strictEqual(res.rowsDetected, false);
    assert.ok(res.vegetationCover < 0.01);
});

test('analyzeImage and analyzePhoto write PNG/JPG outputs', async () => {
    const sharp = require('sharp');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cofly-an-'));
    const w = 240, h = 180;
    const px = image(w, h, (x, y) => (Math.abs((x % 60) - 30) < 7 ? GREEN : (x - 60) ** 2 + (y - 90) ** 2 < 81 ? WEED : SOIL));
    const file = path.join(dir, 'IMG_0001.jpg');
    await sharp(px, { raw: { width: w, height: h, channels: 4 } }).jpeg({ quality: 95 }).toFile(file);

    const a = await indices.analyzeImage(file, path.join(dir, 'health'));
    assert.deepStrictEqual(Object.keys(a.indices).sort(), ['GLI', 'NGBDI', 'NGRDI', 'VARI']);
    for (const k of Object.keys(a.indices)) assert.ok(fs.existsSync(a.indices[k].png));

    const wres = await weeds.analyzePhoto(file, path.join(dir, 'weeds'));
    assert.ok(fs.existsSync(wres.overlay) && fs.existsSync(wres.mask));
    assert.ok(wres.vegetationCover > 0.1);
    fs.rmSync(dir, { recursive: true, force: true });
});
