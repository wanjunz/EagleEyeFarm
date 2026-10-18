const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../server');

let server, base;
const auth = 'Basic ' + Buffer.from('farmer:secret').toString('base64');

test.before(async () => {
    const app = createApp({ password: 'secret', mock: true, ratePerMinute: 5 });
    await new Promise(resolve => { server = app.listen(0, resolve); });
    base = 'http://127.0.0.1:' + server.address().port;
});

test.after(() => server.close());

function post(path, body, headers = {}) {
    return fetch(base + path, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', Authorization: auth }, headers),
        body: JSON.stringify(body)
    });
}

test('refuses to start without a password', () => {
    const saved = process.env.WEB_PASSWORD;
    delete process.env.WEB_PASSWORD;
    assert.throws(() => createApp({ mock: true }), /WEB_PASSWORD/);
    if (saved) process.env.WEB_PASSWORD = saved;
});

test('page and API need the password', async () => {
    assert.strictEqual((await fetch(base + '/')).status, 401);
    assert.strictEqual((await post('/api/mission', { words: 'filled.count.soap' }, { Authorization: 'Basic ' + Buffer.from('x:wrong').toString('base64') })).status, 401);
    const page = await fetch(base + '/', { headers: { Authorization: auth } });
    assert.strictEqual(page.status, 200);
    assert.match(await page.text(), /what3words/);
});

test('mission endpoint returns the Eve card', async () => {
    const res = await post('/api/mission', { words: '///filled.count.soap', height: 40, gimbalPitch: -60 });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.card.lat, 51.520847);
    assert.strictEqual(data.card.height, 40);
    assert.strictEqual(data.card.gimbalPitch, -60);
    assert.deepStrictEqual(data.errors, []);
});

test('bad addresses and unsafe settings are reported', async () => {
    const bad = await post('/api/mission', { words: 'not a w3w' });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await bad.json()).error.code, 'BadWords');
    const high = await (await post('/api/mission', { words: 'filled.count.soap', height: 500 })).json();
    assert.match(high.errors.join(), /height/);
});

test('zip download contains the mission files', async () => {
    const res = await post('/api/mission.zip', { words: 'filled.count.soap' });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /atom2-filled-count-soap\.zip/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(buf.slice(0, 2).toString(), 'PK');
    assert.ok(buf.includes('global.json'));
});

test('rate limit protects the what3words quota', async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await post('/api/mission', { words: 'filled.count.soap' });
    assert.strictEqual(last.status, 429);
});
