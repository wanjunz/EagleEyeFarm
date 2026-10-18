// End-to-end test of the Atom 2 field workflow on a synthetic project and synthetic drone photos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const piexif = require('piexifjs');
const pipeline = require('../js/analysis/pipeline');
const { readPhotoInfo } = require('../js/analysis/photos');
const stitching = require('../js/analysis/stitching');

const lat0 = 39.6, lng0 = 22.4;
const dLat = 60 / 111320, dLng = 80 / (111320 * Math.cos(lat0 * Math.PI / 180));

function toDms(deg) {
    const d = Math.floor(Math.abs(deg)), mf = (Math.abs(deg) - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60 * 10000);
    return [[d, 1], [m, 1], [s, 10000]];
}

async function fakePhoto(file, lat, lng, draw) {
    const w = 320, h = 240, buf = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = draw(x, y), p = (y * w + x) * 3;
        buf[p] = c[0]; buf[p + 1] = c[1]; buf[p + 2] = c[2];
    }
    const jpg = await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    const exif = { '0th': {}, Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2026:06:01 10:00:00' }, GPS: {} };
    if (lat != null) {
        exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
        exif.GPS[piexif.GPSIFD.GPSLatitude] = toDms(lat);
        exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
        exif.GPS[piexif.GPSIFD.GPSLongitude] = toDms(lng);
        exif.GPS[piexif.GPSIFD.GPSAltitude] = [120, 1];
    }
    fs.writeFileSync(file, Buffer.from(piexif.insert(piexif.dump(exif), jpg.toString('binary')), 'binary'));
}

const GREEN = [60, 160, 50], SOIL = [140, 110, 80], WEED = [70, 150, 45];

let tmp, project, sd, closeSd;
test.before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cofly-pipe-'));
    project = path.join(tmp, 'projects', 'Farm');
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, 'map_data.geojson'), JSON.stringify({
        type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[
            [lng0, lat0], [lng0 + dLng, lat0], [lng0 + dLng, lat0 + dLat], [lng0, lat0 + dLat], [lng0, lat0]]] } }]
    }));
    fs.writeFileSync(path.join(project, 'disabled_paths.geojson'), '');

    // "SD card" with 4 scan photos: healthy except a bare patch in photo 3
    sd = path.join(tmp, 'sd', 'DCIM');
    fs.mkdirSync(sd, { recursive: true });
    const spots = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
    for (let i = 0; i < spots.length; i++) {
        const [fx, fy] = spots[i];
        await fakePhoto(path.join(sd, 'IMG_000' + (i + 1) + '.JPG'), lat0 + dLat * fy, lng0 + dLng * fx,
            (x, y) => (i === 2 && (x - 160) ** 2 + (y - 120) ** 2 < 40 ** 2 ? SOIL : GREEN));
    }
    // close-up photos: crop rows with a weed between rows; the first has no GPS (matched to the hot-point)
    closeSd = path.join(tmp, 'sd2');
    fs.mkdirSync(closeSd);
    const rows = (x, y) => (Math.abs((x % 60) - 30) < 7 ? GREEN : (x - 60) ** 2 + (y - 120) ** 2 < 100 ? WEED : SOIL);
    await fakePhoto(path.join(closeSd, 'IMG_0101.JPG'), null, null, rows);
    await fakePhoto(path.join(closeSd, 'IMG_0102.JPG'), lat0 + dLat * 0.75, lng0 + dLng * 0.25, rows);
});
test.after(() => { if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("KEPT", tmp); });

test('EXIF GPS is read from photos', () => {
    const info = readPhotoInfo(path.join(sd, 'IMG_0001.JPG'));
    assert.ok(Math.abs(info.lat - (lat0 + dLat * 0.25)) < 1e-5);
    assert.ok(Math.abs(info.lng - (lng0 + dLng * 0.25)) < 1e-5);
});

test('full workflow: plan -> import -> quick map -> crop health -> hot-points -> weeds', async () => {
    // 1. plan
    const { plan, missions } = pipeline.planScan(project, { height: 20, angle: 90, speed: 5 });
    assert.ok(plan.waypoints.length > 4 && missions.length >= 1);
    assert.ok(fs.existsSync(path.join(project, 'paths', 'calculated_path.json')));
    const eve = pipeline.serializePlanMission(missions, 0, '1739000000000');
    assert.ok(eve.files['1739000000000.json'].includes('"action":"PHOTO"'));

    // 2. import
    const scan = pipeline.importScan(project, sd);
    assert.strictEqual(scan.meta.photoCount, 4);
    assert.strictEqual(scan.meta.withGps, 4);
    assert.ok(fs.readFileSync(path.join(project, 'paths', 'image_list.txt'), 'utf8').startsWith('IMG_0001.JPG 39.6'));

    // 3. map (quick mode: no Docker in tests)
    const map = await pipeline.buildMap(project, scan.scanId, { mode: 'quick' });
    assert.strictEqual(map.type, 'photos');
    assert.strictEqual(map.tiles.length, 4);

    // 4. crop health: the bare patch in photo 3 is the problem area
    const health = await pipeline.cropHealth(project, scan.scanId);
    assert.ok(health.problems.GLI.length >= 1, 'expected a problem point');
    const p = health.problems.GLI[0];
    assert.ok(Math.abs(p.lat - (lat0 + dLat * 0.75)) < dLat * 0.15, 'problem lat in photo 3');
    assert.ok(Math.abs(p.lng - (lng0 + dLng * 0.25)) < dLng * 0.15, 'problem lng in photo 3');
    assert.strictEqual(health.overlays.GLI.length, 4);
    assert.ok(fs.existsSync(path.join(project, 'problematic_areas_points.json')));
    assert.ok(pipeline.listScans(project)[0].health);

    // 5. hot-point mission at low height over the problem areas
    const hot = pipeline.planHotpoints(project, scan.scanId, { height: 6 });
    assert.strictEqual(hot.mission.waypoints[0].height, 6);
    assert.strictEqual(hot.mission.waypoints[0].action, 'PHOTO');

    // 6. close-ups -> weeds; photo without GPS gets the hot-point position
    const weedsRes = await pipeline.importCloseups(project, closeSd);
    assert.strictEqual(weedsRes.photoCount, 2);
    assert.ok(weedsRes.results.every(r => r.weedCover >= 0 && r.weedCover <= 1));
    assert.ok(weedsRes.results.every(r => fs.existsSync(path.join(project, 'closeups', weedsRes.id, r.overlay))));
    assert.ok(weedsRes.results.every(r => r.lat != null));
    assert.strictEqual(pipeline.listCloseups(project).length, 1);
});

test('analyse every scan photo and stitch photo / crop-health / weed maps', async () => {
    const scan = pipeline.importScan(project, sd, { height: 20, orientation: 'north' });
    const stages = new Set();
    const a = await pipeline.analyzeScan(project, scan.scanId, { onProgress: st => stages.add(st), maxPx: 1200 });
    assert.deepStrictEqual([...stages], ['Measuring colours', 'Analysing photos', 'Stitching maps']);
    assert.strictEqual(a.photoCount, 4);
    for (const key of ['photos', 'weeds', 'GLI', 'VARI', 'NGRDI', 'NGBDI']) {
        const f = path.join(project, 'scans', scan.scanId, 'analysis', a.layers[key]);
        assert.ok(fs.existsSync(f), key + ' map missing');
        const meta = await sharp(f).metadata();
        assert.ok(meta.width > 100 && meta.height > 100);
    }
    // field bounds contain all photo positions; the bare patch (photo 3) is a problem area
    assert.ok(a.bounds.north > lat0 + dLat * 0.75 && a.bounds.south < lat0 + dLat * 0.25);
    assert.ok(a.problems.GLI.length >= 1);
    const p = a.problems.GLI[0];
    assert.ok(Math.abs(p.lat - (lat0 + dLat * 0.75)) < dLat * 0.2 && Math.abs(p.lng - (lng0 + dLng * 0.25)) < dLng * 0.2);
    assert.ok(a.weeds.cover >= 0 && a.weeds.cover <= 1);
    // field health summary: one crop-health score and one weed number
    const f = a.fieldSummary;
    assert.ok(f.cropHealth.score >= 0 && f.cropHealth.score <= 100);
    assert.ok(['Good', 'Fair', 'Poor'].includes(f.cropHealth.rating));
    assert.ok(f.cropHealth.patchyPct > 0, 'the bare patch shows up as an area that needs a look');
    assert.ok(f.weeds.pct >= 0 && ['Low', 'Moderate', 'High'].includes(f.weeds.rating));
    // older analyses without a summary get one on demand
    const file = path.join(project, 'scans', scan.scanId, 'analysis', 'analysis.json');
    const stored = JSON.parse(fs.readFileSync(file));
    delete stored.fieldSummary;
    fs.writeFileSync(file, JSON.stringify(stored));
    const again = await pipeline.summarizeScan(project, scan.scanId);
    assert.strictEqual(again.cropHealth.score, f.cropHealth.score);
    assert.ok(JSON.parse(fs.readFileSync(file)).fieldSummary);
    // the close-up planner reads the crop-health summary written by analyzeScan
    assert.ok(pipeline.planHotpoints(project, scan.scanId).mission.waypoints.length >= 1);
});

test('single what3words photo: crop health + weeds', async () => {
    const out = path.join(tmp, 'w3w_photo');
    const r = await pipeline.analyzeSinglePhoto(path.join(closeSd, 'IMG_0102.JPG'), out, { height: 6 });
    assert.ok(r.health.GLI.mean > 0);
    assert.ok(r.weeds.cover >= 0 && r.weeds.cover <= 1);
    assert.ok(r.tile.lat != null, 'position from EXIF');
    for (const f of [r.files.GLI, r.files.weeds, r.files.weedsPhoto]) assert.ok(fs.existsSync(path.join(out, f)));
    assert.ok(fs.existsSync(path.join(out, 'analysis.json')));
});

test('OpenDroneMap (structure from motion) docker arguments', () => {
    const args = stitching.odmArgs('/tmp/x');
    assert.deepStrictEqual(args.slice(0, 4), ['run', '--rm', '-v', '/tmp/x:/datasets']);
    assert.ok(args.includes('--fast-orthophoto'));
    assert.ok(!args.includes('--geo'), 'no geo file when every photo has GPS');
    const withGeo = stitching.odmArgs('/tmp/x', { geo: [{ name: 'a.jpg', lat: 1, lng: 2 }] });
    assert.deepStrictEqual(withGeo.slice(-2), ['--geo', '/datasets/project/geo.txt']);
});

test('findDocker gives friendly messages', async () => {
    const enoent = async () => { const e = new Error('x'); e.code = 'ENOENT'; throw e; };
    await assert.rejects(stitching.findDocker(enoent), /not installed/);
    const notRunning = async () => { const e = new Error('Cannot connect'); e.code = 1; throw e; };
    await assert.rejects(stitching.findDocker(notRunning), /not running/);
});
