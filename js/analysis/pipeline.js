// Potensic Atom 2 field workflow for a project. Each step reads/writes files in the project
// folder, so steps can be re-run and the GUI can redraw results after a restart.
//
//   1. planScan        field outline  -> lawnmower path -> Atom 2 Eve missions
//   2. importScan      SD-card photos -> scans/<id>/images (+ GPS from EXIF)
//   3. analyzeScan     photos -> structure-from-motion orthomosaic (or GPS placement) -> crop health,
//                      problem areas, weeds, field summary and stitched maps
//   4. buildMap / cropHealth   older single steps (photo map only / crop health only)
//   5. planHotpoints   problem areas -> low-altitude Atom 2 photo mission
//   6. importCloseups  close-up photos -> weed detection

const fs = require('fs');
const path = require('path');
const planner = require('./path_planner');
const photos = require('./photos');
const stitching = require('./stitching');
const indices = require('./indices');
const problems = require('./problem_areas');
const photoAnalysis = require('./photo_analysis');
const mosaic = require('./mosaic');
const fieldSummary = require('./field_summary');
const orthoAnalysis = require('./ortho_analysis');
const atom2 = require('../drones/potensic_atom2');

const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fallback; } };
const writeJSON = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 2)); };
const newId = () => String(Date.now());

function fieldRing(projectDir) {
    const rings = planner.ringsFromGeoJSON(readJSON(path.join(projectDir, 'map_data.geojson'), null));
    if (!rings.length) throw new Error('This project has no field outline (map_data.geojson).');
    return rings[0];
}

function fieldCentre(projectDir) {
    const ring = fieldRing(projectDir);
    return ring.reduce((a, p) => ({ lat: a.lat + p.lat / ring.length, lng: a.lng + p.lng / ring.length }), { lat: 0, lng: 0 });
}

// ---------- 1. scan plan ----------

function planScan(projectDir, settings = {}) {
    const height = Number(settings.height) || 30;
    const noFly = planner.ringsFromGeoJSON(readJSON(path.join(projectDir, 'disabled_paths.geojson'), null));
    const plan = planner.planCoverage(fieldRing(projectDir), {
        height,
        angle: Number(settings.angle) || 0,
        spacing: Number(settings.spacing) || undefined,
        speed: Number(settings.speed) || 5,
        noFly
    });
    const missions = atom2.buildCoverageMissions(plan.waypoints, {
        height, speed: Math.min(Number(settings.speed) || 5, atom2.LIMITS.maxSpeed),
        gimbalPitch: -90, hoverTime: 1, maxWaypoints: settings.maxWaypoints || atom2.LIMITS.maxWaypoints
    });
    const scanPlan = Object.assign({ created: new Date().toISOString(), height, settings, missionCount: missions.length }, plan);
    writeJSON(path.join(projectDir, 'atom2', 'scan_plan.json'), scanPlan);
    writeJSON(path.join(projectDir, 'atom2', 'scan_missions.json'), missions);

    // Keep CoFly's own path file so the existing map drawing still works
    const cofly = { SenderID: 'CoFly-Atom2', DataObject: { generated_path: { waypoints: plan.waypoints, altitude: height, speed: Number(settings.speed) || 5, 'Gimbal Pitch': -90 } } };
    fs.mkdirSync(path.join(projectDir, 'paths'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'paths', 'calculated_path.json'), JSON.stringify(JSON.stringify(cofly)));
    return { plan: scanPlan, missions };
}

/** Write one plan mission (index i) as Eve files for a given Eve mission id. */
function serializePlanMission(missions, i, missionId) {
    if (!missions[i]) throw new Error('No mission ' + (i + 1));
    return atom2.serialize(missions[i], missionId);
}

// ---------- 2. import scan photos ----------

function importScan(projectDir, srcDir, opts = {}) {
    const scanId = opts.scanId || newId();
    const scanDir = path.join(projectDir, 'scans', scanId);
    const plan = readJSON(path.join(projectDir, 'atom2', 'scan_plan.json'), null);
    const height = Number(opts.height) || (plan ? plan.height : 30);
    const list = photos.importPhotos(srcDir, path.join(scanDir, 'images'), {
        missionWaypoints: plan ? plan.waypoints.map(w => Object.assign({ height: plan.height }, w)) : [],
        since: opts.since, height,
        // scans planned in this app point the Atom 2 north at every photo
        orientation: opts.orientation || (plan ? 'north' : undefined)
    });
    const meta = { scanId, imported: new Date().toISOString(), source: srcDir, height, photoCount: list.length, withGps: list.filter(p => p.lat != null).length, orientation: opts.orientation || (plan ? 'north' : 'auto') };
    writeJSON(path.join(scanDir, 'scan.json'), meta);
    // CoFly reads paths/image_list.txt
    fs.mkdirSync(path.join(projectDir, 'paths'), { recursive: true });
    fs.copyFileSync(path.join(scanDir, 'images', 'image_list.txt'), path.join(projectDir, 'paths', 'image_list.txt'));
    return { scanId, scanDir, photos: list, meta };
}

function listScans(projectDir) {
    const dir = path.join(projectDir, 'scans');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'scan.json')))
        .map(d => Object.assign({
            map: readJSON(path.join(dir, d, 'map', 'map.json'), null),
            health: readJSON(path.join(dir, d, 'health', 'health.json'), null),
            analysis: readJSON(path.join(dir, d, 'analysis', 'analysis.json'), null)
        }, readJSON(path.join(dir, d, 'scan.json'), {})))
        .sort((a, b) => Number(b.scanId) - Number(a.scanId));
}

// ---------- 3. field map ----------

async function buildMap(projectDir, scanId, opts = {}) {
    const scanDir = path.join(projectDir, 'scans', scanId);
    const meta = readJSON(path.join(scanDir, 'scan.json'), {});
    const list = readJSON(path.join(scanDir, 'images', 'photos.json'), []);
    const mapDir = path.join(scanDir, 'map');
    const mode = opts.mode || 'auto';
    if (mode === 'odm' || mode === 'auto') {
        try {
            return await stitching.stitchWithODM(path.join(scanDir, 'images'), mapDir, { onLog: opts.onLog });
        } catch (e) {
            if (mode === 'odm') throw e;
            if (opts.onLog) opts.onLog('Stitching not possible (' + e.message + ') - making a quick photo map instead.');
        }
    }
    return stitching.quickMap(list, mapDir, { height: meta.height });
}

// ---------- 4. crop health + problem areas ----------

function mergeClose(points, metres) {
    const out = [];
    for (const p of points.sort((a, b) => b.weight - a.weight)) {
        const near = out.find(q => planner && Math.hypot((q.lat - p.lat) * 111320, (q.lng - p.lng) * 111320 * Math.cos(p.lat * Math.PI / 180)) < metres);
        if (near) near.weight += p.weight; else out.push(Object.assign({}, p));
    }
    return out;
}

async function cropHealth(projectDir, scanId, opts = {}) {
    const scanDir = path.join(projectDir, 'scans', scanId);
    const map = readJSON(path.join(scanDir, 'map', 'map.json'), null);
    if (!map) throw new Error('Build the field map first.');
    const healthDir = path.join(scanDir, 'health');
    const names = Object.keys(indices.INDICES);
    const summary = { scanId, type: map.type, created: new Date().toISOString(), indices: {}, overlays: {}, problems: {} };
    names.forEach(n => { summary.indices[n] = { mean: 0, lowFraction: 0, problemFraction: 0, pixels: 0 }; summary.overlays[n] = []; summary.problems[n] = []; });

    const jobs = map.type === 'ortho'
        ? [{ file: path.join(scanDir, 'map', 'ortho.png'), bounds: map.bounds, prefix: '' }]
        : map.tiles.map(t => ({ file: path.join(scanDir, 'images', t.photo), bounds: t.bounds, prefix: t.photo.replace(/\.[^.]+$/, '') + '_' }));

    // Pass 1: index values for every image; pass 2: colour + detect with ONE range per index,
    // so photos of the same field are compared on the same scale.
    const maps = [];
    for (const job of jobs) maps.push(await indices.indexMaps(job.file, { maxSize: map.type === 'ortho' ? 2000 : 700 }));
    const ranges = {};
    names.forEach(n => { ranges[n] = indices.sharedRange(maps.map(m => m.maps[n])); });
    summary.ranges = ranges;

    for (let j = 0; j < jobs.length; j++) {
        const job = jobs[j];
        const res = await indices.analyzeImage(job.file, healthDir, { prefix: job.prefix, maps: maps[j], ranges });
        for (const n of names) {
            const r = res.indices[n];
            const s = summary.indices[n];
            s.mean += (r.mean || 0) * r.validPixels; s.lowFraction += r.lowFraction * r.validPixels; s.pixels += r.validPixels;
            summary.overlays[n].push({ image: path.relative(scanDir, r.png), bounds: job.bounds, range: r.range });
            // ground size of one pixel -> smooth over ~1.5 m (wider than crop-row spacing), ignore patches under ~1 m²
            const metresPerPx = (job.bounds.east - job.bounds.west) * 111320 * Math.cos(job.bounds.north * Math.PI / 180) / res.width;
            const det = problems.detect(r.values, res.width, res.height, r.range, {
                blurRadius: Math.round((opts.blurMetres || 1.5) / metresPerPx),
                minPixels: Math.max(4, Math.round((opts.minAreaM2 || 1) / (metresPerPx * metresPerPx))),
                mergePixels: Math.round((opts.mergeMetres || 4) / metresPerPx)
            });
            let flagged = 0;
            for (const m of det.mask) flagged += m;
            s.problemFraction += flagged;
            det.points.forEach(p => summary.problems[n].push(Object.assign(
                problems.pixelToLatLng(p.x, p.y, res.width, res.height, job.bounds),
                { weight: p.weight / (res.width * res.height) }
            )));
        }
    }
    for (const n of names) {
        const s = summary.indices[n];
        if (s.pixels) { s.mean /= s.pixels; s.lowFraction /= s.pixels; s.problemFraction /= s.pixels; }
        summary.problems[n] = mergeClose(summary.problems[n], opts.mergeMetres || 4).slice(0, opts.maxPoints || 20);
    }
    writeJSON(path.join(healthDir, 'health.json'), summary);
    writeProblemFile(projectDir, summary.problems[opts.index || 'GLI']);
    return summary;
}

/** CoFly's problematic_areas_points.json format (InitialPosition + [lon,lat] list). */
function writeProblemFile(projectDir, points) {
    const c = fieldCentre(projectDir);
    fs.writeFileSync(path.join(projectDir, 'problematic_areas_points.json'), JSON.stringify({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', InitialPosition: [c.lng, c.lat], geometry: { type: 'Polygon', coordinates: [points.map(p => [p.lng, p.lat])] } }]
    }));
}

// ---------- 3+4. analyse every photo, then stitch photo / crop-health / weed maps ----------

/**
 * Analyse each scan photo (crop health + weeds) and stitch the results into field maps:
 *   analysis/mosaic/photos.png, analysis/mosaic/<INDEX>.png, analysis/mosaic/weeds.png
 * onProgress(stage, done, total, name)
 */
/**
 * Crop health, problem areas, weeds and the field summary for a scan, plus stitched field maps.
 * opts.method:
 *   'sfm'  structure from motion (OpenDroneMap, needs Docker and overlapping photos): one seamless
 *          orthomosaic, analysed tile by tile
 *   'gps'  each photo analysed and placed on the map by its GPS position (fast, no extra software)
 *   'auto' structure from motion when possible, otherwise GPS placement (default in the app)
 */
async function analyzeScan(projectDir, scanId, opts = {}) {
    const scanDir = path.join(projectDir, 'scans', scanId);
    const list = readJSON(path.join(scanDir, 'images', 'photos.json'), []).filter(p => p.lat != null);
    if (!list.length) throw new Error('None of the photos have a GPS position, so they cannot be placed on the field.');
    const outDir = path.join(scanDir, 'analysis');
    const method = opts.method || 'gps';
    let summary = null, note = null;
    if (method === 'sfm' || method === 'auto') {
        try {
            if (list.length < 5) throw new Error('3D matching needs at least 5 overlapping photos; this scan has ' + list.length + '.');
            const docker = await stitching.findDocker();
            summary = await analyzeScanSfm(scanDir, outDir, list, Object.assign({}, opts, { docker }));
        } catch (e) {
            if (method === 'sfm') throw e;
            note = '3D matching was not possible (' + e.message + ') The photos were placed by GPS instead.';
            if (opts.onProgress) opts.onProgress(note, 0, 1);
        }
    }
    if (!summary) summary = await analyzeScanGps(scanDir, outDir, list, opts);
    summary = Object.assign({ scanId, created: new Date().toISOString(), photoCount: list.length }, summary);
    if (note || summary.stitchNote) summary.stitchNote = note || summary.stitchNote;
    const names = Object.keys(indices.INDICES);
    writeJSON(path.join(outDir, 'analysis.json'), summary);

    // keep the crop-health format the close-up planner reads
    writeJSON(path.join(scanDir, 'health', 'health.json'), {
        scanId, type: 'mosaic', indices: summary.health, problems: summary.problems,
        overlays: Object.fromEntries(names.map(n => [n, [{ image: path.join('analysis', summary.layers[n]), bounds: summary.bounds }]]))
    });
    writeProblemFile(projectDir, summary.problems.GLI);
    return summary;
}

// weighted mean of r[key] over results (weight = share of the field each one covers)
const wmean = (results, get) => {
    const tw = results.reduce((s, r) => s + (r.weight != null ? r.weight : 1), 0) || 1;
    return results.reduce((s, r) => s + (r.weight != null ? r.weight : 1) * (get(r) || 0), 0) / tw;
};

/** Shared tail: field-wide numbers from per-photo or per-tile results. */
function combineResults(results, opts) {
    const names = Object.keys(indices.INDICES);
    const out = { health: {}, problems: {} };
    for (const n of names) {
        out.health[n] = { mean: wmean(results, r => r.health[n].mean), problemFraction: wmean(results, r => r.health[n].problemFraction) };
        out.problems[n] = mergeClose(results.flatMap(r => r.problems[n].filter(q => q.lat != null).map(q => ({ lat: q.lat, lng: q.lng, weight: q.areaM2 }))), 4)
            .slice(0, opts.maxPoints || 20);
    }
    out.fieldSummary = fieldSummary.summarize(results.map(r => ({ cells: r.cells, weedCover: r.weeds.cover, weight: r.weight })));
    return out;
}

async function analyzeScanSfm(scanDir, outDir, list, opts) {
    const o = await orthoAnalysis.analyzeOrtho(scanDir, outDir, opts);
    const r = o.results;
    const tooHigh = o.gsdCm > photoAnalysis.MAX_WEED_GSD_M * 100;
    const summary = Object.assign({
        stitch: 'sfm', bounds: o.bounds, layers: o.layers, ranges: o.ranges,
        weeds: {
            cover: wmean(r, x => x.weeds.cover), tooHigh, tooHighPhotos: tooHigh ? list.length : 0, gsdCm: o.gsdCm,
            patches: mergeClose(r.flatMap(x => x.weeds.patches.filter(q => q.lat != null).map(q => ({ lat: q.lat, lng: q.lng, weight: 1 }))), 3)
        },
        method: { stitch: 'Structure from motion (OpenDroneMap ' + stitching.ODM_IMAGE.split(':')[1] + '), analysed in ' + o.tileM + ' m tiles',
            weeds: 'Gradient-boosted trees trained on CoFly-WeedDB (see README)', health: 'RGB vegetation indices' },
        tiles: r.length, photos: [], stitchNote: o.note || undefined
    }, combineResults(r, opts));
    if (summary.fieldSummary) summary.fieldSummary.context.photos = list.length;
    return summary;
}

async function analyzeScanGps(scanDir, outDir, list, opts) {
    const perPhotoDir = path.join(outDir, 'photos');
    const prog = opts.onProgress || (() => {});
    const names = Object.keys(indices.INDICES);

    // pass 1: one colour scale per index for the whole field
    const samples = {};
    names.forEach(n => { samples[n] = []; });
    for (let i = 0; i < list.length; i++) {
        prog('Measuring colours', i + 1, list.length, list[i].name);
        const m = await indices.indexMaps(path.join(scanDir, 'images', list[i].name), { maxSize: 300 });
        names.forEach(n => samples[n].push(m.maps[n]));
    }
    const ranges = {};
    names.forEach(n => { ranges[n] = indices.sharedRange(samples[n]); });

    // pass 2: per-photo crop health + weeds
    const results = [];
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        prog('Analysing photos', i + 1, list.length, p.name);
        const r = await photoAnalysis.analyzePhoto(path.join(scanDir, 'images', p.name), perPhotoDir, p, { ranges });
        results.push(Object.assign({ lat: p.lat, lng: p.lng, heading: p.heading, widthM: p.widthM, heightM: p.heightM }, r));
    }

    // stitch the field maps
    const tiles = list.map(p => ({ lat: p.lat, lng: p.lng, heading: p.heading, widthM: p.widthM, heightM: p.heightM, pixelWidth: 900 }));
    const lay = mosaic.layout(tiles, { maxPx: opts.maxPx || 5000 });
    const layers = { photos: 'mosaic/photos.png', weeds: 'mosaic/weeds.png' };
    names.forEach(n => { layers[n] = 'mosaic/' + n + '.png'; });
    const layerTiles = key => list.map((p, i) => Object.assign({}, tiles[i], {
        image: key === 'photos' ? path.join(scanDir, 'images', p.name) : path.join(perPhotoDir, results[i].files[key])
    }));
    const keys = Object.keys(layers);
    for (let k = 0; k < keys.length; k++) {
        prog('Stitching maps', k + 1, keys.length, keys[k]);
        await mosaic.render(layerTiles(keys[k]), path.join(outDir, layers[keys[k]]), lay);
    }

    const area = list.length;
    return Object.assign({
        stitch: 'gps', bounds: lay.bounds, layers, ranges,
        weeds: {
            cover: results.reduce((s, r) => s + r.weeds.cover, 0) / area,
            tooHighPhotos: results.filter(r => r.weeds.tooHigh).length,
            gsdCm: +(results.reduce((s, r) => s + r.weeds.gsdCm, 0) / area).toFixed(2),
            patches: mergeClose(results.flatMap(r => r.weeds.patches.filter(q => q.lat != null).map(q => ({ lat: q.lat, lng: q.lng, weight: 1 }))), 3)
        },
        method: { stitch: 'Photos placed by GPS position', weeds: 'Gradient-boosted trees trained on CoFly-WeedDB (see README)', health: 'RGB vegetation indices' },
        photos: results.map(r => ({ photo: r.photo, lat: r.lat, lng: r.lng, weedCover: r.weeds.cover, gli: r.health.GLI.mean, files: r.files }))
    }, combineResults(results, opts));
}

/**
 * Crop-health score and weed % for a scan. Analyses from before the summary existed are
 * completed here (about 0.2 s per photo) and saved, so the full analysis does not need re-running.
 */
async function summarizeScan(projectDir, scanId, opts = {}) {
    const scanDir = path.join(projectDir, 'scans', scanId);
    const file = path.join(scanDir, 'analysis', 'analysis.json');
    const a = readJSON(file, null);
    if (!a) throw new Error('Analyse the photos first (step 4).');
    if (a.fieldSummary && !opts.force) return a.fieldSummary;
    if (a.stitch === 'sfm') throw new Error('Run step 4 again to update this scan.');
    const photosMeta = readJSON(path.join(scanDir, 'images', 'photos.json'), []);
    const byName = Object.fromEntries(photosMeta.map(p => [p.name, p]));
    const rows = [];
    for (let i = 0; i < a.photos.length; i++) {
        const p = a.photos[i];
        if (opts.onProgress) opts.onProgress(i + 1, a.photos.length);
        const tile = byName[p.photo] || p;
        const cells = await photoAnalysis.photoCells(path.join(scanDir, 'images', p.photo), tile, a.ranges.GLI);
        rows.push({ cells, weedCover: p.weedCover });
    }
    a.fieldSummary = fieldSummary.summarize(rows);
    writeJSON(file, a);
    return a.fieldSummary;
}

/** Analyse a single photo (e.g. the what3words photo): crop health + weeds, own colour scale. */
async function analyzeSinglePhoto(file, outDir, opts = {}) {
    const info = photos.readPhotoInfo(file);
    const size = photos.jpegSize(file);
    const cam = photos.cameraFor(info.make, info.model);
    const height = Number(opts.height) || 30;
    const widthM = 2 * height * Math.tan(cam.hfovDeg / 2 * Math.PI / 180);
    const tile = {
        lat: info.lat != null ? info.lat : (opts.lat != null ? opts.lat : null),
        lng: info.lng != null ? info.lng : (opts.lng != null ? opts.lng : null),
        heading: opts.heading || 0, widthM, heightM: widthM * size.height / size.width
    };
    fs.mkdirSync(outDir, { recursive: true });
    const dest = path.join(outDir, path.basename(file));
    if (path.resolve(dest) !== path.resolve(file)) fs.copyFileSync(file, dest);
    const r = await photoAnalysis.analyzePhoto(dest, outDir, tile);
    const summary = Object.assign({ created: new Date().toISOString(), height, camera: cam.name, image: path.basename(file), tile }, r);
    writeJSON(path.join(outDir, 'analysis.json'), summary);
    return summary;
}

// ---------- 5. hot-point (close-up) mission ----------

function planHotpoints(projectDir, scanId, opts = {}) {
    const health = readJSON(path.join(projectDir, 'scans', scanId, 'health', 'health.json'), null);
    if (!health) throw new Error('Run crop health first.');
    const pts = health.problems[opts.index || 'GLI'] || [];
    if (!pts.length) throw new Error('No problem areas were found for ' + (opts.index || 'GLI') + '. The field looks evenly healthy.');
    const route = planner.orderPoints(pts, fieldCentre(projectDir));
    const height = Number(opts.height) || 6;   // CoFly-WeedDB photos were taken at ~5 m
    const mission = atom2.buildCoverageMissions(route, { height, gimbalPitch: -90, hoverTime: 3, speed: 3 })[0];
    const hot = { created: new Date().toISOString(), scanId, index: opts.index || 'GLI', height, points: route };
    writeJSON(path.join(projectDir, 'atom2', 'hotpoint_plan.json'), hot);
    writeJSON(path.join(projectDir, 'atom2', 'hotpoint_mission.json'), mission);
    return { plan: hot, mission };
}

// ---------- 6. close-up photos -> weeds ----------

async function importCloseups(projectDir, srcDir, opts = {}) {
    const id = opts.id || newId();
    const dir = path.join(projectDir, 'closeups', id);
    const hot = readJSON(path.join(projectDir, 'atom2', 'hotpoint_plan.json'), null);
    const list = photos.importPhotos(srcDir, path.join(dir, 'images'), {
        missionWaypoints: hot ? hot.points : [], since: opts.since,
        height: Number(opts.height) || (hot ? hot.height : 6), orientation: 'north'
    });
    const results = [];
    for (const p of list) {
        if (opts.onProgress) opts.onProgress(results.length + 1, list.length, p.name);
        const r = await photoAnalysis.analyzePhoto(p.file, path.join(dir, 'weeds'), p);
        results.push({
            lat: p.lat, lng: p.lng, photo: p.name, image: path.join('images', p.name),
            overlay: path.join('weeds', r.files.weedsPhoto), weedCover: r.weeds.cover, tooHigh: r.weeds.tooHigh,
            gsdCm: r.weeds.gsdCm, gli: r.health.GLI.mean, patches: r.weeds.patches
        });
    }
    const summary = {
        id, created: new Date().toISOString(), photoCount: results.length,
        method: 'Gradient-boosted trees trained on CoFly-WeedDB; purple = likely weed clusters',
        results
    };
    writeJSON(path.join(dir, 'weeds.json'), summary);
    return summary;
}

function listCloseups(projectDir) {
    const dir = path.join(projectDir, 'closeups');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map(d => readJSON(path.join(dir, d, 'weeds.json'), null)).filter(Boolean)
        .sort((a, b) => Number(b.id) - Number(a.id));
}

module.exports = {
    planScan, serializePlanMission, importScan, listScans, buildMap, cropHealth, analyzeScan, summarizeScan, analyzeSinglePhoto, planHotpoints,
    importCloseups, listCloseups, fieldRing, fieldCentre, readJSON
};
