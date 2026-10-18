// Turn a list of what3words addresses into numbered waypoints with coordinates you can enter in the
// Potensic Eve app (Eve does not understand what3words; on iPhone, missions are made by hand in Eve).

const w3w = require('./what3words');

const MAX_WAYPOINTS = 30;   // Potensic apps have been reported to cap missions at about 30 points

function toDms(deg, pos, neg) {
    const hemi = deg >= 0 ? pos : neg;
    const a = Math.abs(deg);
    let d = Math.floor(a), m = Math.floor((a - d) * 60), s = (a - d - m / 60) * 3600;
    if (s >= 59.995) { s = 0; m += 1; }
    if (m >= 60) { m = 0; d += 1; }
    return d + '°' + String(m).padStart(2, '0') + "'" + s.toFixed(2).padStart(5, '0') + '"' + hemi;
}

/** Coordinate strings in the formats people (and apps) usually accept. */
function formats(lat, lng) {
    const la = lat.toFixed(6), ln = lng.toFixed(6);
    return {
        lat: la,
        lng: ln,
        decimal: la + ', ' + ln,
        dms: toDms(lat, 'N', 'S') + ' ' + toDms(lng, 'E', 'W'),
        appleMaps: 'https://maps.apple.com/?ll=' + la + ',' + ln + '&q=' + la + ',' + ln + '&t=k',
        googleMaps: 'https://www.google.com/maps/search/?api=1&query=' + la + ',' + ln
    };
}

/** Order points around their centre (a loop that does not cross itself), starting from the first one given. */
function loopOrder(points) {
    if (points.length < 3) return points.slice();
    const c = points.reduce((a, p) => ({ lat: a.lat + p.lat / points.length, lng: a.lng + p.lng / points.length }), { lat: 0, lng: 0 });
    const k = Math.cos(c.lat * Math.PI / 180);
    // clockwise as seen on a north-up map
    const angle = p => -Math.atan2(p.lat - c.lat, (p.lng - c.lng) * k);
    const sorted = points.slice().sort((a, b) => angle(a) - angle(b));
    const start = sorted.indexOf(points[0]);
    return sorted.slice(start).concat(sorted.slice(0, start));
}

function distanceM(a, b) {
    return Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));
}

/** Split free text (one address per line, or separated by spaces/commas) into addresses. */
function parseList(input) {
    const list = Array.isArray(input) ? input : String(input || '').split(/[\s,;]+/);
    return list.map(s => String(s).trim()).filter(Boolean);
}

/**
 * Resolve what3words addresses into numbered waypoints.
 * @param {string|string[]} input  addresses (array or text)
 * @param {object} opts { apiKey, mock, loop (order as a loop around the area), fetchImpl }
 * @returns {Promise<{waypoints, errors, testMode, loopLengthM}>}
 */
async function resolveWaypoints(input, opts = {}) {
    const words = parseList(input);
    if (!words.length) throw new w3w.W3WError('MissingWords', 'Enter at least one what3words address.', 400);
    if (words.length > MAX_WAYPOINTS) throw new w3w.W3WError('TooMany', 'Enter at most ' + MAX_WAYPOINTS + ' addresses (Eve missions hold about 30 points).', 400);

    const testMode = w3w.useTestMode(opts.apiKey, opts.mock);
    const found = [], errors = [];
    for (let i = 0; i < words.length; i++) {
        try {
            const r = await w3w.convertToCoordinates(words[i], { apiKey: opts.apiKey, mock: testMode, fetchImpl: opts.fetchImpl });
            if (found.some(f => f.words === r.words)) { errors.push({ input: words[i], message: 'Listed twice; used once.' }); continue; }
            found.push(r);
        } catch (e) {
            errors.push({ input: words[i], code: e.code, message: e.message });
        }
    }
    const ordered = opts.loop ? loopOrder(found) : found;
    const waypoints = ordered.map((r, i) => Object.assign({
        n: i + 1, words: r.words, nearestPlace: r.nearestPlace || '', square: r.square
    }, { latitude: r.lat, longitude: r.lng }, formats(r.lat, r.lng)));
    let loopLengthM = 0;
    for (let i = 1; i < ordered.length; i++) loopLengthM += distanceM(ordered[i - 1], ordered[i]);
    if (opts.loop && ordered.length > 2) loopLengthM += distanceM(ordered[ordered.length - 1], ordered[0]);
    return { waypoints, errors, testMode, loopLengthM: Math.round(loopLengthM) };
}

/** Plain-text list for copying into notes or messages. */
function asText(waypoints, opts = {}) {
    const head = opts.height ? 'Potensic Eve waypoints (height ' + opts.height + ' m, camera ' + (opts.gimbalPitch != null ? opts.gimbalPitch : -90) + '°):' : 'Potensic Eve waypoints:';
    return [head].concat(waypoints.map(w => w.n + '. ' + w.decimal + '   (///' + w.words + ')')).join('\n');
}

module.exports = { resolveWaypoints, formats, toDms, loopOrder, parseList, asText, MAX_WAYPOINTS };
