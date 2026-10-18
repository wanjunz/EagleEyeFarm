// Field analysis on a structure-from-motion orthomosaic.
//
// OpenDroneMap finds the same features in overlapping photos, rebuilds the camera positions and the
// field surface in 3D (structure from motion) and projects everything straight down into one seamless,
// true-to-scale map (orthomosaic). Crop health, problem areas, weeds and the field summary are then
// worked out on that map, tile by tile, with the same code used for single photos.

const fs = require('fs');
const path = require('path');
const stitching = require('./stitching');
const indices = require('./indices');
const photoAnalysis = require('./photo_analysis');

const TILE_M = 30;        // tile size on the ground (about one Atom 2 photo at 25 m)
const MAP_PX = 900;       // map pixels per tile, as for photos
const MAX_LAYER_PX = 5000;
const MIN_VALID = 0.05;   // skip tiles that are almost all outside the map

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

/** Positions ODM cannot read from the photos themselves (photos matched to planned waypoints). */
function geoEntries(list, height) {
    return list.filter(p => p.gpsSource === 'mission' && p.lat != null)
        .map(p => ({ name: p.name, lat: p.lat, lng: p.lng, alt: p.alt != null ? p.alt : height }));
}

/** Pixel grid of the orthomosaic in tiles of about TILE_M metres (exported for tests). */
function tileGrid(width, height, bounds, tileM = TILE_M) {
    const latC = (bounds.north + bounds.south) / 2;
    const mPerPxX = (bounds.east - bounds.west) / width * 111320 * Math.cos(latC * Math.PI / 180);
    const mPerPxY = (bounds.north - bounds.south) / height * 111320;
    const tw = Math.max(64, Math.round(tileM / mPerPxX)), th = Math.max(64, Math.round(tileM / mPerPxY));
    const tiles = [];
    for (let top = 0, row = 0; top < height; top += th, row++) {
        for (let left = 0, col = 0; left < width; left += tw, col++) {
            const w = Math.min(tw, width - left), h = Math.min(th, height - top);
            tiles.push({
                row, col, left, top, w, h,
                lat: bounds.north - (top + h / 2) / height * (bounds.north - bounds.south),
                lng: bounds.west + (left + w / 2) / width * (bounds.east - bounds.west),
                heading: 0, widthM: w * mPerPxX, heightM: h * mPerPxY
            });
        }
    }
    return { tiles, tileW: tw, tileH: th, mPerPxX, mPerPxY };
}

/**
 * Run (or reuse) structure from motion for a scan. Returns {bounds, tif, reused}.
 * Reuses scans/<id>/sfm when it is newer than the imported photos, unless opts.force.
 */
async function buildOrtho(scanDir, opts = {}) {
    const sfmDir = path.join(scanDir, 'sfm');
    const tif = path.join(sfmDir, 'ortho_wgs84.tif');
    const map = readJSON(path.join(sfmDir, 'map.json'), null);
    const photosFile = path.join(scanDir, 'images', 'photos.json');
    if (!opts.force && map && fs.existsSync(tif) && fs.statSync(tif).mtimeMs > fs.statSync(photosFile).mtimeMs) {
        return { bounds: map.bounds, tif, reused: true, note: map.note };
    }
    fs.rmSync(sfmDir, { recursive: true, force: true });
    const list = readJSON(photosFile, []);
    const meta = readJSON(path.join(scanDir, 'scan.json'), {});
    const res = await stitching.stitchWithODM(path.join(scanDir, 'images'), sfmDir, {
        onLog: opts.onLog, resolutionCm: opts.resolutionCm, geo: geoEntries(list, meta.height), docker: opts.docker
    });
    // keep only the orthophotos: OpenDroneMap's working files take close to 1 GB per scan
    for (const d of fs.readdirSync(path.join(sfmDir, 'project'))) {
        if (d !== 'odm_orthophoto') fs.rmSync(path.join(sfmDir, 'project', d), { recursive: true, force: true });
    }
    if (res.note) fs.writeFileSync(path.join(sfmDir, 'map.json'), JSON.stringify(Object.assign(readJSON(path.join(sfmDir, 'map.json'), {}), { note: res.note }), null, 2));
    return { bounds: res.bounds, tif, reused: false, note: res.note };
}

/** Join tile images (all at one scale) into one map layer. */
async function joinTiles(items, width, height, outFile) {
    const sharp = require('sharp');
    const composites = items.filter(t => fs.existsSync(t.file)).map(t => ({ input: t.file, left: t.left, top: t.top }));
    const raw = await sharp({ create: { width: width + 2, height: height + 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(composites).raw().toBuffer();
    let img = sharp(raw, { raw: { width: width + 2, height: height + 2, channels: 4 } }).extract({ left: 0, top: 0, width, height });
    if (Math.max(width, height) > MAX_LAYER_PX) {
        img = sharp(await img.raw().toBuffer(), { raw: { width, height, channels: 4 } })
            .resize(MAX_LAYER_PX, MAX_LAYER_PX, { fit: 'inside' });
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    await img.png().toFile(outFile);
}

/**
 * Analyse a scan on its orthomosaic. Returns per-tile results plus the stitched layers, in the shape
 * pipeline.analyzeScan turns into analysis.json.
 */
async function analyzeOrtho(scanDir, outDir, opts = {}) {
    const sharp = require('sharp');
    const prog = opts.onProgress || (() => {});
    prog('Matching photos in 3D (structure from motion)', 0, 1);
    const ortho = await buildOrtho(scanDir, opts);
    const meta = await sharp(ortho.tif, { limitInputPixels: false }).metadata();
    const grid = tileGrid(meta.width, meta.height, ortho.bounds, opts.tileM);
    const names = Object.keys(indices.INDICES);

    // pass 1: one colour scale per index for the whole field, from a small copy of the map
    prog('Measuring colours', 1, 1);
    const small = await sharp(ortho.tif, { limitInputPixels: false }).resize(1500, 1500, { fit: 'inside' })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ranges = {};
    for (const n of names) ranges[n] = indices.sharedRange([indices.computeIndex(n, small.data, small.info.width, small.info.height, 4)]);

    // pass 2: crop health, problem areas, weeds and summary areas per tile
    const scale = MAP_PX / Math.max(grid.tileW, grid.tileH);
    const tileDir = path.join(outDir, 'tiles');
    const results = [];
    for (let i = 0; i < grid.tiles.length; i++) {
        const t = grid.tiles[i];
        prog('Analysing the stitched map', i + 1, grid.tiles.length, 'tile ' + (i + 1));
        const full = await sharp(ortho.tif, { limitInputPixels: false }).extract({ left: t.left, top: t.top, width: t.w, height: t.h })
            .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let valid = 0;
        for (let p = 3; p < full.data.length; p += 4) if (full.data[p]) valid++;
        if (valid < MIN_VALID * t.w * t.h) continue;
        const img = { data: full.data, width: full.info.width, height: full.info.height, channels: 4 };
        const r = await photoAnalysis.analyzeRaster(img, tileDir, 'tile_' + t.row + '_' + t.col, t, { ranges, scale, photoJpg: false });
        results.push(Object.assign({}, t, r, { weight: r.validFraction * t.widthM * t.heightM }));
    }
    if (!results.length) throw new Error('The stitched map is empty.');

    // stitch the layers: photos straight from the orthomosaic, the rest from the tiles
    const width = Math.round(meta.width * scale), height = Math.round(meta.height * scale);
    const layers = { photos: 'mosaic/photos.png', weeds: 'mosaic/weeds.png' };
    names.forEach(n => { layers[n] = 'mosaic/' + n + '.png'; });
    const keys = Object.keys(layers);
    fs.mkdirSync(path.join(outDir, 'mosaic'), { recursive: true });
    for (let k = 0; k < keys.length; k++) {
        prog('Stitching maps', k + 1, keys.length, keys[k]);
        const out = path.join(outDir, layers[keys[k]]);
        if (keys[k] === 'photos') {
            const f = Math.min(1, MAX_LAYER_PX / Math.max(width, height));
            await sharp(ortho.tif, { limitInputPixels: false }).resize(Math.round(width * f), Math.round(height * f), { fit: 'fill' }).png().toFile(out);
        } else {
            await joinTiles(results.map(r => ({ file: path.join(tileDir, r.files[keys[k]]), left: Math.round(r.left * scale), top: Math.round(r.top * scale) })),
                width, height, out);
        }
    }
    return {
        bounds: ortho.bounds, layers, ranges, results, reused: ortho.reused, note: ortho.note,
        gsdCm: +(100 * Math.max(grid.mPerPxX, grid.mPerPxY)).toFixed(2), tileM: opts.tileM || TILE_M
    };
}

module.exports = { analyzeOrtho, buildOrtho, tileGrid, geoEntries, TILE_M };
