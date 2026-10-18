// Run our problem-area detector on the same cases, configured exactly as the app uses it.
const fs = require('fs'), path = require('path');
const [root, caseDir] = process.argv.slice(2);
const { detect, pixelToLatLng } = require(path.join(root, 'js/analysis/problem_areas'));
const { displayRange } = require(path.join(root, 'js/analysis/indices'));
const meta = JSON.parse(fs.readFileSync(path.join(caseDir, 'cases.json')));
const out = {};
for (const [name, m] of Object.entries(meta)) {
    const buf = fs.readFileSync(path.join(caseDir, name + '.f32'));
    const values = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
    try {
        const det = detect(values, m.width, m.height, displayRange(values), {
            blurRadius: Math.round(1.5 / m.metres_per_px),
            minPixels: Math.round(1 / (m.metres_per_px ** 2))
        });
        const b = { west: 22, north: 40, east: 22 + m.width * 1e-6, south: 40 - m.height * 1e-6 };
        out[name] = {
            points: det.points.map(p => [p.x, p.y]),
            geo: det.points.map(p => { const ll = pixelToLatLng(p.x, p.y, m.width, m.height, b); return [ll.lat, ll.lng]; })
        };
    } catch (e) { out[name] = { error: e.message }; }
}
console.log(JSON.stringify(out));
