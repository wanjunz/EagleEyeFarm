const test = require('node:test');
const assert = require('node:assert');
const wp = require('../js/w3w/waypoints');
const { createApp } = require('../server');

const DONNELLY = ['///donnelly.field.cambridge', '///donnelly.field.northeast', '///donnelly.field.southeast', '///donnelly.field.southwest'];

test('Donnelly Field sample addresses become numbered Eve waypoints', async () => {
    const r = await wp.resolveWaypoints(DONNELLY.join('\n'), { mock: true });
    assert.strictEqual(r.waypoints.length, 4);
    assert.deepStrictEqual(r.errors, []);
    const first = r.waypoints[0];
    assert.strictEqual(first.n, 1);
    assert.strictEqual(first.words, 'donnelly.field.cambridge');
    assert.strictEqual(first.decimal, '42.371580, -71.092280');
    assert.strictEqual(first.lat, '42.371580');
    assert.strictEqual(first.lng, '-71.092280');
    assert.strictEqual(first.dms, '42°22\'17.69"N 71°05\'32.21"W');
    assert.match(first.appleMaps, /ll=42\.371580,-71\.092280/);
    assert.ok(r.loopLengthM > 300 && r.loopLengthM < 900, 'perimeter-ish route length ' + r.loopLengthM);
});

test('loop order: corners given in any order come out as a non-crossing clockwise loop', async () => {
    const shuffled = [DONNELLY[0], DONNELLY[2], DONNELLY[1], DONNELLY[3]];   // NW, SE, NE, SW would cross
    const r = await wp.resolveWaypoints(shuffled, { mock: true, loop: true });
    assert.deepStrictEqual(r.waypoints.map(w => w.words.split('.').pop()), ['cambridge', 'northeast', 'southeast', 'southwest']);
});

test('accepts commas/spaces, reports bad and duplicate addresses without stopping', async () => {
    const r = await wp.resolveWaypoints('donnelly.field.cambridge, nope.nope.nope  donnelly.field.cambridge', { mock: true });
    assert.strictEqual(r.waypoints.length, 1);
    assert.strictEqual(r.errors.length, 2);
    assert.match(r.errors[0].message, /sample addresses/);
    assert.match(r.errors[1].message, /twice/);
});

test('no key means test mode; limits and empty input', async () => {
    const saved = process.env.W3W_API_KEY;
    delete process.env.W3W_API_KEY;
    const r = await wp.resolveWaypoints(DONNELLY[0], {});
    assert.strictEqual(r.testMode, true);
    if (saved) process.env.W3W_API_KEY = saved;
    await assert.rejects(wp.resolveWaypoints('', { mock: true }), { code: 'MissingWords' });
    await assert.rejects(wp.resolveWaypoints(Array(31).fill(DONNELLY[0]), { mock: true }), { code: 'TooMany' });
});

test('DMS formatting rounds cleanly', () => {
    assert.strictEqual(wp.toDms(10.999999999, 'N', 'S'), '11°00\'00.00"N');
    assert.strictEqual(wp.toDms(-0.5, 'E', 'W'), '0°30\'00.00"W');
});

test('web page API: config, waypoints and multi-waypoint mission zip', async () => {
    const app = createApp({ password: 'pw', ratePerMinute: 50 });   // no API key -> test mode
    const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
    const base = 'http://127.0.0.1:' + server.address().port;
    const auth = { Authorization: 'Basic ' + Buffer.from('u:pw').toString('base64'), 'Content-Type': 'application/json' };
    try {
        const cfg = await (await fetch(base + '/api/config', { headers: auth })).json();
        assert.strictEqual(cfg.testMode, true);
        assert.ok(cfg.samples.some(s => s.words === 'donnelly.field.cambridge'));

        const res = await fetch(base + '/api/waypoints', { method: 'POST', headers: auth, body: JSON.stringify({ words: DONNELLY.join('\n'), height: 25, loop: true }) });
        const d = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(d.waypoints.length, 4);
        assert.strictEqual(d.height, 25);
        assert.match(d.text, /^Potensic Eve waypoints \(height 25 m, camera -90°\):\n1\. 42\.371580, -71\.092280/);

        const high = await (await fetch(base + '/api/waypoints', { method: 'POST', headers: auth, body: JSON.stringify({ words: DONNELLY[0], height: 300 }) })).json();
        assert.match(high.problems.join(), /120 m/);

        const zip = await fetch(base + '/api/mission.zip', { method: 'POST', headers: auth, body: JSON.stringify({ words: DONNELLY.join('\n'), height: 25, loop: true }) });
        assert.strictEqual(zip.status, 200);
        assert.match(zip.headers.get('content-disposition'), /atom2-4-waypoints\.zip/);
        const buf = Buffer.from(await zip.arrayBuffer());
        assert.strictEqual(buf.slice(0, 2).toString(), 'PK');
    } finally {
        server.close();
    }
});
