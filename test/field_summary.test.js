const test = require('node:test');
const assert = require('node:assert');
const fs = require('../js/analysis/field_summary');

test('Canopeo canopy mask: green leaves yes, soil and white no', () => {
    const px = Buffer.from([60, 160, 50, 255, 150, 120, 90, 255, 240, 240, 240, 255, 90, 150, 70, 255]);
    assert.deepStrictEqual([...fs.canopyMask(px, 4, 4)], [1, 0, 0, 1]);
});

test('areas are about 4 m on the ground and carry map corners', () => {
    const w = 80, h = 40, rgba = Buffer.alloc(w * h * 4, 0);
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = 60; rgba[i * 4 + 1] = 160; rgba[i * 4 + 2] = 50; rgba[i * 4 + 3] = 255; }
    const gli = new Float32Array(w * h).fill(0.3);
    const cells = fs.cellStats(rgba, w, h, 4, gli, null, { lat: 40, lng: 22, heading: 0, widthM: 16, heightM: 8 });
    assert.strictEqual(cells.length, 4 * 2);
    assert.ok(cells.every(c => Math.abs(c.cover - 1) < 1e-9 && Math.abs(c.plantGli - 0.3) < 1e-6 && c.problem === 0));
    assert.strictEqual(cells[0].corners.length, 4);
});

test('summary flags thin, pale and patchy areas and rates the field', () => {
    const ok = { cover: 0.5, plantGli: 0.2, problem: 0 };
    const cells = Array(90).fill(ok).concat([
        { cover: 0.2, plantGli: 0.2, problem: 0, corners: [[0, 0], [0, 1], [1, 1], [1, 0]] },   // thin
        { cover: 0.5, plantGli: 0.1, problem: 0, corners: [[0, 0], [0, 1], [1, 1], [1, 0]] },   // pale
        { cover: 0.5, plantGli: 0.2, problem: 0.5, corners: [[0, 0], [0, 1], [1, 1], [1, 0]] }  // patchy
    ]).concat(Array(7).fill(ok));
    const s = fs.summarize([{ cells: cells.slice(0, 50), weedCover: 0.01 }, { cells: cells.slice(50), weedCover: 0.05 }]);
    assert.strictEqual(s.cropHealth.score, 97);
    assert.strictEqual(s.cropHealth.rating, 'Good');
    assert.strictEqual(s.cropHealth.thinPct, 1);
    assert.strictEqual(s.cropHealth.palePct, 1);
    assert.strictEqual(s.cropHealth.patchyPct, 1);
    assert.strictEqual(s.attentionAreas.length, 3);
    assert.deepStrictEqual(s.attentionAreas.map(a => a.why[0]), ['thin crop', 'pale crop', 'bare/stressed patches']);
    assert.strictEqual(s.weeds.pct, 3);
    assert.strictEqual(s.weeds.rating, 'Moderate');
});

test('bare field: no crop score instead of scoring soil colour', () => {
    const cells = Array(50).fill({ cover: 0.01, plantGli: null, problem: 0.3, corners: [[0, 0], [0, 1], [1, 1], [1, 0]] });
    const s = fs.summarize([{ cells, weedCover: 0 }]);
    assert.strictEqual(s.cropHealth.score, null);
    assert.strictEqual(s.cropHealth.rating, 'No crop seen');
    assert.strictEqual(s.attentionAreas.length, 0);
    assert.strictEqual(s.weeds.pct, 0);
});

test('ratings', () => {
    assert.deepStrictEqual([90, 85, 84, 65, 64].map(fs.rateHealth), ['Good', 'Good', 'Fair', 'Fair', 'Poor']);
    assert.deepStrictEqual([0, 1.9, 2, 10, 10.1].map(fs.rateWeeds), ['Low', 'Low', 'Moderate', 'Moderate', 'High']);
    assert.strictEqual(fs.summarize([]), null);
});
