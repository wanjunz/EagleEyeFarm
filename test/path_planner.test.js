const test = require('node:test');
const assert = require('node:assert');
const { planCoverage, orderPoints, footprint, ringsFromGeoJSON } = require('../js/analysis/path_planner');

// ~200 m x 100 m rectangle near Larissa
const lat0 = 39.6, lng0 = 22.4;
const dLat = 100 / 111320, dLng = 200 / (111320 * Math.cos(lat0 * Math.PI / 180));
const field = [
    { lat: lat0, lng: lng0 }, { lat: lat0, lng: lng0 + dLng },
    { lat: lat0 + dLat, lng: lng0 + dLng }, { lat: lat0 + dLat, lng: lng0 }
];
const inside = p => p.lat >= lat0 - 1e-9 && p.lat <= lat0 + dLat + 1e-9 && p.lng >= lng0 - 1e-9 && p.lng <= lng0 + dLng + 1e-9;

test('footprint grows with height', () => {
    const a = footprint(10), b = footprint(30);
    assert.ok(b.width > a.width * 2.9 && b.width < a.width * 3.1);
});

test('east-west lines with 20 m spacing over a 100 m tall field give 5 lines inside the field', () => {
    const plan = planCoverage(field, { spacing: 20, angle: 90, height: 30 });
    assert.strictEqual(plan.lines, 5);
    assert.ok(plan.waypoints.every(inside));
    assert.ok(Math.abs(plan.areaM2 - 20000) < 200, 'area ≈ 2 ha, got ' + plan.areaM2);
    assert.ok(plan.minutes > 0);
});

test('serpentine order: consecutive lines start at alternate ends', () => {
    const plan = planCoverage(field, { spacing: 20, angle: 90, height: 30 });
    const first = plan.waypoints[0], last = plan.waypoints[plan.waypoints.length - 1];
    // 5 lines: first line starts west, the 5th (odd count) ends east
    assert.ok(first.lng < lng0 + dLng / 2);
    assert.ok(last.lng > lng0 + dLng / 2);
});

test('no-fly zone removes waypoints inside it', () => {
    const nf = [
        { lat: lat0 + dLat * 0.3, lng: lng0 + dLng * 0.4 }, { lat: lat0 + dLat * 0.3, lng: lng0 + dLng * 0.6 },
        { lat: lat0 + dLat * 0.7, lng: lng0 + dLng * 0.6 }, { lat: lat0 + dLat * 0.7, lng: lng0 + dLng * 0.4 }
    ];
    const plan = planCoverage(field, { spacing: 10, angle: 90, height: 20, noFly: [nf] });
    const inNf = p => p.lat > lat0 + dLat * 0.31 && p.lat < lat0 + dLat * 0.69 && p.lng > lng0 + dLng * 0.41 && p.lng < lng0 + dLng * 0.59;
    assert.ok(plan.waypoints.length > 0);
    assert.ok(!plan.waypoints.some(inNf));
});

test('errors for missing field', () => {
    assert.throws(() => planCoverage([]), /field outline/);
});

test('orderPoints visits nearest first', () => {
    const pts = [{ lat: 0, lng: 3 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }];
    assert.deepStrictEqual(orderPoints(pts, { lat: 0, lng: 0 }).map(p => p.lng), [1, 2, 3]);
});

test('ringsFromGeoJSON reads CoFly map_data.geojson', () => {
    const gj = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[22.4, 39.6], [22.5, 39.6], [22.5, 39.7], [22.4, 39.6]]] } }] };
    const rings = ringsFromGeoJSON(gj);
    assert.strictEqual(rings.length, 1);
    assert.deepStrictEqual(rings[0][1], { lat: 39.6, lng: 22.5 });
});
