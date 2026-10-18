const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ortho = require('../js/analysis/ortho_analysis');
const photoAnalysis = require('../js/analysis/photo_analysis');
const fieldSummary = require('../js/analysis/field_summary');

test('orthomosaic is cut into ~30 m tiles that cover every pixel once', () => {
    // 200 m x 100 m at 2 cm per pixel
    const lat = 41, mx = 0.02 / (111320 * Math.cos(lat * Math.PI / 180)), my = 0.02 / 111320;
    const W = 10000, H = 5000;
    const b = { west: -83, east: -83 + W * mx, north: lat + H * my / 2, south: lat - H * my / 2 };
    const g = ortho.tileGrid(W, H, b);
    assert.strictEqual(g.tileW, 1500);
    assert.strictEqual(g.tiles.length, 7 * 4);
    assert.strictEqual(g.tiles.reduce((s, t) => s + t.w * t.h, 0), W * H);
    const first = g.tiles[0];
    assert.ok(Math.abs(first.widthM - 30) < 0.01 && Math.abs(first.heightM - 30) < 0.01);
    assert.ok(first.lat < b.north && first.lng > b.west && first.heading === 0);
});

test('only photos placed from the flight plan go into the OpenDroneMap geo file', () => {
    const e = ortho.geoEntries([
        { name: 'a.jpg', lat: 1, lng: 2, gpsSource: 'exif' },
        { name: 'b.jpg', lat: 3, lng: 4, gpsSource: 'mission' }
    ], 30);
    assert.deepStrictEqual(e, [{ name: 'b.jpg', lat: 3, lng: 4, alt: 30 }]);
});

test('summary areas ignore pixels outside the stitched map', () => {
    const w = 80, h = 40, rgba = Buffer.alloc(w * h * 4, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        if (x >= 50) continue;                    // right part: no data (alpha 0)
        rgba[p] = 60; rgba[p + 1] = 160; rgba[p + 2] = 50; rgba[p + 3] = 255;
    }
    const gli = new Float32Array(w * h).fill(0.3);
    const cells = fieldSummary.cellStats(rgba, w, h, 4, gli, null, { lat: 40, lng: 22, heading: 0, widthM: 16, heightM: 8 });
    // 4 columns of 20 px: two full, one half-covered (kept, 10/20 px), one empty (dropped)
    assert.strictEqual(cells.length, 3 * 2);
    assert.ok(cells.every(c => c.cover === 1), 'no-data pixels do not make the crop look thin');
});

test('in-memory tile analysis: no-data pixels are never weeds', async () => {
    const w = 400, h = 300, data = Buffer.alloc(w * h * 4, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x >= 200) continue;
        const p = (y * w + x) * 4, row = x % 40 < 12;
        data[p] = row ? 60 : 140; data[p + 1] = row ? 150 : 110; data[p + 2] = row ? 50 : 80; data[p + 3] = 255;
    }
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-'));
    const r = await photoAnalysis.analyzeRaster({ data, width: w, height: h, channels: 4 }, out, 'tile_0_0',
        { lat: 41, lng: -83, heading: 0, widthM: 8, heightM: 6 }, { photoJpg: false });
    assert.ok(Math.abs(r.validFraction - 0.5) < 0.01);
    assert.ok(r.weeds.cover >= 0 && r.weeds.cover <= 1);
    assert.ok(fs.existsSync(path.join(out, r.files.weeds)) && fs.existsSync(path.join(out, r.files.GLI)));
    assert.ok(Number.isNaN(r.health.GLI.mean) === false);
});
