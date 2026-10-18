// Phone-friendly web page: type a what3words address in the field and get the Atom 2 waypoint.
//
//   W3W_API_KEY=... WEB_PASSWORD=... npm run web        (W3W_MOCK=1 for offline testing)
//
// The what3words key stays on the server. Access needs the shared password (HTTP basic auth,
// any username). iPhone users get the values to enter in Potensic Eve; Android users can also
// download the mission files.

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const archiver = require('archiver');
const { planW3WPhoto, atom2, w3w } = require('../js/drones');
const waypoints = require('../js/w3w/waypoints');

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function basicAuth(password) {
    return (req, res, next) => {
        const header = req.headers.authorization || '';
        const [scheme, encoded] = header.split(' ');
        if (scheme === 'Basic' && encoded) {
            const decoded = Buffer.from(encoded, 'base64').toString();
            const pass = decoded.slice(decoded.indexOf(':') + 1);
            if (safeEqual(pass, password)) return next();
        }
        res.set('WWW-Authenticate', 'Basic realm="Eagle Eye", charset="UTF-8"');
        res.status(401).send('Password required');
    };
}

// Simple fixed-window limiter per IP, to protect the paid what3words quota.
function rateLimit({ windowMs, max }) {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const entry = hits.get(req.ip) || { count: 0, start: now };
        if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
        entry.count++;
        hits.set(req.ip, entry);
        if (entry.count > max) return res.status(429).json({ error: { code: 'RateLimited', message: 'Too many lookups. Wait a minute and try again.' } });
        next();
    };
}

function createApp(config = {}) {
    const password = config.password != null ? config.password : process.env.WEB_PASSWORD;
    if (!password) throw new Error('Set WEB_PASSWORD so the page (and your what3words quota) is not open to everyone.');
    const apiKey = config.apiKey || process.env.W3W_API_KEY;
    // Without a what3words key the page runs in test mode on the sample addresses (e.g. Donnelly Field).
    const testMode = w3w.useTestMode(apiKey, config.mock != null ? config.mock : process.env.W3W_MOCK === '1');
    const planOpts = { apiKey, mock: testMode };

    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy || false);
    app.use(basicAuth(password));
    app.use(express.json({ limit: '8kb' }));
    app.use(express.static(path.join(__dirname, 'public')));

    const limiter = rateLimit({ windowMs: 60000, max: config.ratePerMinute || 20 });

    async function plan(body) {
        return planW3WPhoto(body.words, Object.assign({}, planOpts, {
            height: body.height, gimbalPitch: body.gimbalPitch, hoverTime: body.hoverTime
        }));
    }

    function sendError(res, e) {
        const status = e.name === 'W3WError' ? (e.status === 401 || e.status === 402 ? 502 : (e.status || 400)) : 500;
        res.status(status).json({ error: { code: e.code || 'Error', message: e.message } });
    }

    app.get('/api/config', (req, res) => {
        res.json({ testMode, samples: testMode ? w3w.listSamples() : [], maxWaypoints: waypoints.MAX_WAYPOINTS });
    });

    // Several what3words -> numbered coordinates to enter in Potensic Eve (iPhone has no mission import)
    app.post('/api/waypoints', limiter, async (req, res) => {
        try {
            const body = req.body || {};
            const r = await waypoints.resolveWaypoints(body.words, { apiKey, mock: testMode, loop: !!body.loop });
            const height = Number(body.height) || 30, gimbalPitch = body.gimbalPitch != null ? Number(body.gimbalPitch) : -90;
            const problems = [];
            if (!(height >= 2 && height <= 120)) problems.push('Height must be 2–120 m (Eve limits height to 120 m above take-off).');
            if (!(gimbalPitch >= -90 && gimbalPitch <= 20)) problems.push('Camera angle must be between -90° (straight down) and 20°.');
            res.json(Object.assign(r, { height, gimbalPitch, problems, text: waypoints.asText(r.waypoints, { height, gimbalPitch }) }));
        } catch (e) { sendError(res, e); }
    });

    app.post('/api/mission', limiter, async (req, res) => {
        try {
            const p = await plan(req.body || {});
            res.json({ location: p.location, card: p.card, errors: p.errors });
        } catch (e) { sendError(res, e); }
    });

    app.post('/api/mission.zip', limiter, async (req, res) => {
        try {
            const body = req.body || {};
            const list = waypoints.parseList(body.words);
            let mission, name, card = null;
            if (list.length > 1) {
                // several addresses: one Eve mission with a photo at each waypoint
                const r = await waypoints.resolveWaypoints(list, { apiKey, mock: testMode, loop: !!body.loop });
                if (!r.waypoints.length) return res.status(400).json({ error: { code: 'BadWords', message: r.errors.map(e => e.message).join('; ') } });
                mission = atom2.buildCoverageMissions(r.waypoints.map(w => ({ lat: w.latitude, lng: w.longitude })), {
                    height: Number(body.height) || 30, gimbalPitch: body.gimbalPitch != null ? Number(body.gimbalPitch) : -90, hoverTime: 3, speed: 5
                })[0];
                name = r.waypoints.length + '-waypoints';
                card = { waypoints: r.waypoints.map(w => ({ n: w.n, words: w.words, coordinates: w.decimal })) };
            } else {
                const p = await plan({ words: list[0], height: body.height, gimbalPitch: body.gimbalPitch, hoverTime: body.hoverTime });
                mission = p.mission; card = p.card; name = p.location.words.replace(/\./g, '-');
            }
            const errors = atom2.validate(mission);
            if (errors.length) return res.status(400).json({ error: { code: 'Unsafe', message: errors.join('; ') } });
            const serialized = atom2.serialize(mission, /^\d+$/.test(String(body.missionId || '')) ? body.missionId : Date.now());
            res.attachment('atom2-' + name + '.zip');
            const zip = archiver('zip');
            zip.pipe(res);
            Object.entries(serialized.files).forEach(([n, content]) => zip.append(content, { name: n }));
            zip.append(JSON.stringify(card, null, 2), { name: 'enter-in-eve.json' });
            zip.finalize();
        } catch (e) { sendError(res, e); }
    });

    return app;
}

if (require.main === module) {
    const port = Number(process.env.PORT) || 8080;
    const app = createApp({ trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false });
    app.listen(port, () => {
        console.log('what3words → Atom 2 page running on http://localhost:' + port + (process.env.W3W_API_KEY ? '' : '  (test mode: sample addresses only)'));
        console.log('On your phone (same Wi-Fi) open http://<this computer\'s IP>:' + port);
    });
}

module.exports = { createApp };
