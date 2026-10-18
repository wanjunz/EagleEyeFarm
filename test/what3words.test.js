const test = require('node:test');
const assert = require('node:assert');
const w3w = require('../js/w3w/what3words');

const fixture = require('./fixtures/w3w/filled.count.soap.json');

function fakeFetch(status, body, calls) {
    return async (url, opts) => {
        if (calls) calls.push({ url, opts });
        return { ok: status >= 200 && status < 300, status, json: async () => body };
    };
}

test.beforeEach(() => w3w.clearCache());

test('isValidW3W accepts common forms and rejects junk', () => {
    assert.ok(w3w.isValidW3W('///filled.count.soap'));
    assert.ok(w3w.isValidW3W('filled.count.soap'));
    assert.ok(w3w.isValidW3W('  ///index.home.raft '));
    assert.ok(w3w.isValidW3W('///école.forêt.été'));
    assert.ok(!w3w.isValidW3W('filled.count'));
    assert.ok(!w3w.isValidW3W('filled count soap'));
    assert.ok(!w3w.isValidW3W('51.52,-0.19'));
    assert.ok(!w3w.isValidW3W(''));
});

test('convertToCoordinates parses a successful response and sends the key as a header', async () => {
    const calls = [];
    const r = await w3w.convertToCoordinates('///Filled.Count.Soap', { apiKey: 'K', fetchImpl: fakeFetch(200, fixture, calls), mock: false });
    assert.strictEqual(r.lat, 51.520847);
    assert.strictEqual(r.lng, -0.195521);
    assert.strictEqual(r.words, 'filled.count.soap');
    assert.deepStrictEqual(r.square, fixture.square);
    assert.match(calls[0].url, /words=filled\.count\.soap$/);
    assert.strictEqual(calls[0].opts.headers['X-Api-Key'], 'K');
});

test('results are cached', async () => {
    const calls = [];
    const f = fakeFetch(200, fixture, calls);
    await w3w.convertToCoordinates('filled.count.soap', { apiKey: 'K', fetchImpl: f, mock: false });
    await w3w.convertToCoordinates('///filled.count.soap', { apiKey: 'K', fetchImpl: f, mock: false });
    assert.strictEqual(calls.length, 1);
});

test('API errors map to friendly W3WError codes', async () => {
    const cases = [
        [400, { error: { code: 'BadWords', message: 'x' } }, 'BadWords'],
        [401, { error: { code: 'InvalidKey', message: 'x' } }, 'InvalidKey'],
        [402, {}, 'QuotaExceeded']
    ];
    for (const [status, body, code] of cases) {
        w3w.clearCache();
        await assert.rejects(
            w3w.convertToCoordinates('filled.count.soap', { apiKey: 'K', fetchImpl: fakeFetch(status, body), mock: false }),
            e => e.name === 'W3WError' && e.code === code && e.status === status
        );
    }
});

test('missing key, bad format and network failure are reported', async () => {
    const saved = process.env.W3W_API_KEY;
    delete process.env.W3W_API_KEY;
    await assert.rejects(w3w.convertToCoordinates('filled.count.soap', { mock: false }), { code: 'MissingKey' });
    if (saved) process.env.W3W_API_KEY = saved;
    await assert.rejects(w3w.convertToCoordinates('not an address', { apiKey: 'K' }), { code: 'BadWords' });
    await assert.rejects(w3w.convertToCoordinates('', { apiKey: 'K' }), { code: 'MissingWords' });
    const failing = async () => { throw new Error('offline'); };
    await assert.rejects(w3w.convertToCoordinates('filled.count.soap', { apiKey: 'K', fetchImpl: failing, mock: false }), { code: 'NetworkError' });
});

test('mock mode reads fixtures without a key', async () => {
    const r = await w3w.convertToCoordinates('///mock.cotton.field', { mock: true });
    assert.strictEqual(r.country, 'GR');
    await assert.rejects(w3w.convertToCoordinates('no.such.fixture', { mock: true }), { code: 'BadWords' });
});
