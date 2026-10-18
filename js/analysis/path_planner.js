// Coverage ("lawnmower") path planning for the Potensic Atom 2.
// Replaces CoFly's Windows-only GeoCordinates.exe. Pure JS, no native dependencies.
//
// The Atom 2 only takes photos at waypoints (Eve has no distance-interval trigger in missions),
// so photo waypoints are placed along each flight line with enough overlap for stitching.

const EARTH_R = 6378137;

// Approximate Atom 2 camera geometry. Field of view is configurable because Potensic does not
// publish an exact value for photo mode; ~80° horizontal is typical for this class of camera.
const DEFAULT_CAMERA = { hfovDeg: 80, aspect: 4 / 3 };

function toLocal(origin) {
    const cosLat = Math.cos(origin.lat * Math.PI / 180);
    return {
        fwd: p => ({ x: (p.lng - origin.lng) * Math.PI / 180 * EARTH_R * cosLat, y: (p.lat - origin.lat) * Math.PI / 180 * EARTH_R }),
        inv: q => ({ lat: origin.lat + q.y / EARTH_R * 180 / Math.PI, lng: origin.lng + q.x / (EARTH_R * cosLat) * 180 / Math.PI })
    };
}

function rotate(q, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return { x: q.x * c - q.y * s, y: q.x * s + q.y * c };
}

function polygonArea(ring) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y);
    return Math.abs(a / 2);
}

// x-intervals where the horizontal line y crosses the inside of a ring (even-odd rule)
function scanIntervals(ring, y) {
    const xs = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j], b = ring[i];
        if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    const out = [];
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
    return out;
}

function subtractIntervals(base, cuts) {
    let result = base.slice();
    for (const [c0, c1] of cuts) {
        const next = [];
        for (const [a, b] of result) {
            if (c1 <= a || c0 >= b) { next.push([a, b]); continue; }
            if (c0 > a) next.push([a, c0]);
            if (c1 < b) next.push([c1, b]);
        }
        result = next;
    }
    return result;
}

/** Ground footprint (m) of one nadir photo at a given height. */
function footprint(height, camera = DEFAULT_CAMERA) {
    const width = 2 * height * Math.tan(camera.hfovDeg / 2 * Math.PI / 180);
    return { width, length: width / camera.aspect };
}

/**
 * Extract the outer ring(s) of a GeoJSON FeatureCollection / Feature / Polygon as [{lat,lng}].
 */
function ringsFromGeoJSON(geojson) {
    if (!geojson) return [];
    const geoms = geojson.type === 'FeatureCollection' ? geojson.features.map(f => f.geometry)
        : geojson.type === 'Feature' ? [geojson.geometry] : [geojson];
    const rings = [];
    for (const g of geoms) {
        if (!g) continue;
        if (g.type === 'Polygon') rings.push(g.coordinates[0]);
        if (g.type === 'MultiPolygon') g.coordinates.forEach(p => rings.push(p[0]));
    }
    return rings.map(r => r.map(([lng, lat]) => ({ lat, lng })));
}

/**
 * Plan a coverage mission over a field.
 * @param {Array<{lat,lng}>} field        outer ring of the field
 * @param {object} opts
 *   spacing   distance between flight lines (m). Default: from camera footprint and sideOverlap.
 *   angle     flight direction in degrees clockwise from north (CoFly's "Flight Direction" slider)
 *   height    flight height (m)
 *   frontOverlap / sideOverlap   0..1 (default 0.75 / 0.65)
 *   noFly     array of rings to avoid
 *   speed     m/s, for the time estimate
 * @returns {{waypoints:[{lat,lng}], lines:number, photoSpacing, lineSpacing, lengthM, minutes, areaM2}}
 */
function planCoverage(field, opts = {}) {
    if (!field || field.length < 3) throw new Error('Draw the field outline (at least 3 points) first.');
    const height = opts.height || 30;
    const fp = footprint(height, opts.camera);
    const frontOverlap = opts.frontOverlap != null ? opts.frontOverlap : 0.75;
    const sideOverlap = opts.sideOverlap != null ? opts.sideOverlap : 0.65;
    const lineSpacing = opts.spacing || Math.max(2, fp.width * (1 - sideOverlap));
    const photoSpacing = Math.max(2, fp.length * (1 - frontOverlap));
    const speed = opts.speed || 5;

    const origin = field.reduce((a, p) => ({ lat: a.lat + p.lat / field.length, lng: a.lng + p.lng / field.length }), { lat: 0, lng: 0 });
    const proj = toLocal(origin);
    // Rotate so flight lines run along x. Angle is a compass bearing (0 = north, lines run N-S).
    const rad = (90 - (opts.angle || 0)) * Math.PI / 180;
    const toPlan = p => rotate(proj.fwd(p), -rad);
    const fromPlan = q => proj.inv(rotate(q, rad));

    const ring = field.map(toPlan);
    const noFly = (opts.noFly || []).map(r => r.map(toPlan));
    const ys = ring.map(p => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const waypoints = [];
    let lineIndex = 0, lengthM = 0, prev = null;
    for (let y = minY + lineSpacing / 2; y < maxY; y += lineSpacing) {
        let segs = scanIntervals(ring, y);
        noFly.forEach(nf => { segs = subtractIntervals(segs, scanIntervals(nf, y)); });
        segs = segs.filter(([a, b]) => b - a > 0.5);
        if (!segs.length) continue;
        if (lineIndex % 2 === 1) segs = segs.reverse().map(([a, b]) => [b, a]);
        for (const [a, b] of segs) {
            const len = Math.abs(b - a);
            const n = Math.max(1, Math.round(len / photoSpacing));
            for (let k = 0; k <= n; k++) {
                const q = { x: a + (b - a) * k / n, y };
                if (prev) lengthM += Math.hypot(q.x - prev.x, q.y - prev.y);
                prev = q;
                waypoints.push(fromPlan(q));
            }
        }
        lineIndex++;
    }
    if (!waypoints.length) throw new Error('The field is too small for this line spacing, or fully covered by no-fly zones.');

    return {
        waypoints,
        lines: lineIndex,
        lineSpacing,
        photoSpacing,
        lengthM,
        areaM2: polygonArea(ring),
        // flying time + ~2 s hover per photo
        minutes: (lengthM / speed + waypoints.length * 2) / 60
    };
}

/**
 * Order problem-area points into a short visiting route (nearest neighbour from the start point).
 */
function orderPoints(points, start) {
    const remaining = points.slice();
    const route = [];
    let cur = start || remaining[0];
    while (remaining.length) {
        let best = 0, bestD = Infinity;
        remaining.forEach((p, i) => {
            const d = (p.lat - cur.lat) ** 2 + ((p.lng - cur.lng) * Math.cos(cur.lat * Math.PI / 180)) ** 2;
            if (d < bestD) { bestD = d; best = i; }
        });
        cur = remaining.splice(best, 1)[0];
        route.push(cur);
    }
    return route;
}

module.exports = { planCoverage, orderPoints, footprint, ringsFromGeoJSON, DEFAULT_CAMERA };
