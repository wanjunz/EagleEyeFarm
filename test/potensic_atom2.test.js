const test = require('node:test');
const assert = require('node:assert');
const atom2 = require('../js/drones/potensic_atom2');
const { planW3WPhoto } = require('../js/drones');

const target = { lat: 51.520847, lng: -0.195521 };

test('photo mission has one PHOTO waypoint at the target with Eve field names', () => {
    const m = atom2.buildPhotoMission(target, { height: 25, gimbalPitch: -80 });
    assert.strictEqual(m.waypoints.length, 1);
    const w = m.waypoints[0];
    assert.strictEqual(w.lat, target.lat);
    assert.strictEqual(w.lng, target.lng);
    assert.strictEqual(w.height, 25);
    assert.strictEqual(w.gimbalType, 'DEFINE');
    assert.strictEqual(w.gimbalPitch, -80);
    assert.strictEqual(w.action, 'PHOTO');
    for (const key of ['hoverTime', 'speedType', 'speed', 'yawType', 'yaw', 'zoomType', 'zoomRatio', 'poiType', 'poiLat', 'poiLng', 'poiHeight', 'fileName']) {
        assert.ok(key in w, 'missing ' + key);
    }
    assert.deepStrictEqual(Object.keys(m.global).sort(), ['finishAction', 'globalHeight', 'globalHeightType', 'isOrder', 'lostAction', 'speed']);
    assert.strictEqual(m.global.finishAction, 'RETURN');
    assert.deepStrictEqual(atom2.validate(m), []);
});

test('serialize writes global.json and <id>.json as "[waypoints];[pois]"', () => {
    const m = atom2.buildPhotoMission(target);
    const s = atom2.serialize(m, '1739000000000');
    assert.deepStrictEqual(Object.keys(s.files).sort(), ['1739000000000.json', 'global.json']);
    const [wps, pois] = s.files['1739000000000.json'].split(';');
    assert.strictEqual(JSON.parse(wps)[0].action, 'PHOTO');
    assert.deepStrictEqual(JSON.parse(pois), []);
    assert.strictEqual(JSON.parse(s.files['global.json']).lostAction, 'RETURN');
    assert.throws(() => atom2.serialize(m, '../evil'), /digits only/);
});

test('validate enforces height, gimbal, coordinates and distance from home', () => {
    const tooHigh = atom2.buildPhotoMission(target, { height: 150 });
    assert.match(atom2.validate(tooHigh).join(), /height/);
    const badPitch = atom2.buildPhotoMission(target, { gimbalPitch: 45 });
    assert.match(atom2.validate(badPitch).join(), /gimbal/);
    const badCoords = atom2.buildPhotoMission({ lat: 95, lng: 0 });
    assert.match(atom2.validate(badCoords).join(), /coordinates/);
    const far = atom2.buildPhotoMission(target);
    const home = { lat: 51.53, lng: -0.195521 };   // ~1 km north
    assert.match(atom2.validate(far, { home, maxDistance: 500 }).join(), /from home/);
    assert.deepStrictEqual(atom2.validate(far, { home, maxDistance: 2000 }), []);
});

test('CoFly calculated path converts to chunked coverage missions', () => {
    const generated = {
        waypoints: Array.from({ length: 150 }, (_, i) => ({ lat: 39.6 + i * 1e-5, lng: 22.4 })),
        altitude: 40, speed: 20, 'Gimbal Pitch': -120
    };
    const missions = atom2.buildCoverageMissions(generated, { maxWaypoints: 99 });
    assert.strictEqual(missions.length, 2);
    assert.strictEqual(missions[0].waypoints.length, 99);
    assert.strictEqual(missions[1].waypoints.length, 51);
    const w = missions[0].waypoints[0];
    assert.strictEqual(w.height, 40);
    assert.strictEqual(w.speed, 15);          // clamped to max speed
    assert.strictEqual(w.gimbalPitch, -90);   // clamped to Atom 2 range
    missions.forEach(m => assert.deepStrictEqual(atom2.validate(m), []));
});

test('manual entry card gives iPhone users everything to type into Eve', () => {
    const card = atom2.manualEntryCard(atom2.buildPhotoMission(target), { words: 'filled.count.soap', nearestPlace: 'Bayswater, London' });
    assert.strictEqual(card.title, '///filled.count.soap');
    assert.strictEqual(card.lat, 51.520847);
    assert.match(card.mapLink, /51\.520847,-0\.195521/);
    assert.ok(card.steps.length >= 4);
});

test('planW3WPhoto: what3words address -> validated photo mission (mock)', async () => {
    const plan = await planW3WPhoto('///filled.count.soap', { mock: true, height: 35 });
    assert.deepStrictEqual(plan.errors, []);
    assert.strictEqual(plan.mission.waypoints[0].lat, 51.520847);
    assert.strictEqual(plan.mission.waypoints[0].height, 35);
    assert.strictEqual(plan.card.title, '///filled.count.soap');
});
