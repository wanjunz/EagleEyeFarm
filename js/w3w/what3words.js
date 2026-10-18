// what3words client: validates 3-word addresses and converts them to coordinates.
// Uses the public REST API (convert-to-coordinates needs a paid what3words plan).
// Mock mode reads fixtures so the rest of the app can be tested without a key.

const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.what3words.com/v3/convert-to-coordinates';
const FIXTURE_DIR = path.join(__dirname, '..', '..', 'test', 'fixtures', 'w3w');

// Three words of letters (any script) separated by "." (also the full-width / ideographic dots w3w accepts).
const W3W_REGEX = /^\/{0,3}[\p{L}\p{M}]+[.｡。･・︒។։။۔።।][\p{L}\p{M}]+[.｡。･・︒។։။۔።।][\p{L}\p{M}]+$/u;

class W3WError extends Error {
    constructor(code, message, status) {
        super(message);
        this.name = 'W3WError';
        this.code = code;
        this.status = status;
    }
}

const FRIENDLY = {
    BadWords: 'That what3words address does not exist. Check the spelling (e.g. ///filled.count.soap).',
    MissingWords: 'Please enter a what3words address.',
    MissingKey: 'No what3words API key is set. Add one in Settings or set W3W_API_KEY.',
    InvalidKey: 'The what3words API key was rejected. Check it in Settings.',
    QuotaExceeded: 'Your what3words plan quota is used up, or your plan does not include convert-to-coordinates (the free plan does not).',
    NetworkError: 'Could not reach what3words. Check the internet connection.'
};

function normalizeW3W(input) {
    return String(input || '').trim().replace(/^\/{1,3}/, '').toLowerCase();
}

function isValidW3W(input) {
    return W3W_REGEX.test(String(input || '').trim());
}

// Minimal fetch fallback for older Electron/Node versions without global fetch.
function httpsFetch(url, options = {}) {
    const https = require('https');
    return new Promise((resolve, reject) => {
        https.get(url, { headers: options.headers }, res => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                json: async () => JSON.parse(data)
            }));
        }).on('error', reject);
    });
}

const cache = new Map();

function parseResponse(body) {
    return {
        words: body.words,
        lat: body.coordinates.lat,
        lng: body.coordinates.lng,
        square: body.square,
        nearestPlace: body.nearestPlace,
        country: body.country,
        map: body.map
    };
}

function readFixture(words) {
    const file = path.join(FIXTURE_DIR, words + '.json');
    if (!fs.existsSync(file)) {
        throw new W3WError('BadWords', 'Test mode only knows the sample addresses (e.g. ///donnelly.field.cambridge). Add a what3words API key in what3words settings to use any address.', 400);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Convert a what3words address to coordinates.
 * @param {string} input   e.g. "///filled.count.soap"
 * @param {object} opts    { apiKey, mock, fetchImpl }
 * @returns {Promise<{words,lat,lng,square,nearestPlace,country,map}>}
 */
async function convertToCoordinates(input, opts = {}) {
    if (!input || !String(input).trim()) throw new W3WError('MissingWords', FRIENDLY.MissingWords, 400);
    if (!isValidW3W(input)) throw new W3WError('BadWords', FRIENDLY.BadWords, 400);
    const words = normalizeW3W(input);
    const mock = opts.mock !== undefined ? opts.mock : process.env.W3W_MOCK === '1';

    if (cache.has(words)) return cache.get(words);

    let result;
    if (mock) {
        result = parseResponse(readFixture(words));
    } else {
        const apiKey = opts.apiKey || process.env.W3W_API_KEY;
        if (!apiKey) throw new W3WError('MissingKey', FRIENDLY.MissingKey, 401);
        const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : httpsFetch);
        let res;
        try {
            res = await fetchImpl(API_URL + '?words=' + encodeURIComponent(words), {
                headers: { 'X-Api-Key': apiKey }
            });
        } catch (e) {
            throw new W3WError('NetworkError', FRIENDLY.NetworkError, 0);
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.error) {
            const code = (body.error && body.error.code) || (res.status === 402 ? 'QuotaExceeded' : 'Unknown');
            const message = FRIENDLY[code] || (body.error && body.error.message) || ('what3words error ' + res.status);
            throw new W3WError(code, message, res.status);
        }
        result = parseResponse(body);
    }
    cache.set(words, result);
    return result;
}

/** Sample (offline test) addresses available without an API key. */
function listSamples() {
    if (!fs.existsSync(FIXTURE_DIR)) return [];
    return fs.readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.json')).map(f => {
        const fx = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf8'));
        return { words: fx.words, nearestPlace: fx.nearestPlace, lat: fx.coordinates.lat, lng: fx.coordinates.lng };
    }).sort((a, b) => a.words.localeCompare(b.words));
}

/** The GUI uses sample addresses when test mode is on or no API key has been entered. */
function useTestMode(apiKey, mockFlag) {
    return !!mockFlag || !apiKey;
}

function clearCache() {
    cache.clear();
}

module.exports = { convertToCoordinates, isValidW3W, normalizeW3W, clearCache, listSamples, useTestMode, W3WError, API_URL };
