// Field map ("orthomosaic") from Potensic Atom 2 scan photos.
//
// Best quality: structure from motion with OpenDroneMap in Docker (cross-platform `docker run`).
// Works on macOS, Windows and Linux with Docker Desktop.
// Fallback without Docker: each photo is placed on the map at its GPS position, sized from the
// flight height and camera field of view (Atom 2 missions from this app face north at every point).

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { footprint } = require('./path_planner');

const ODM_IMAGE = 'opendronemap/odm:3.6.2';   // has native arm64 (Apple Silicon) and amd64 builds
const RETRY_RESOLUTION_CM = 4;                 // after running out of memory
const DOCKER_CANDIDATES = ['docker', '/usr/local/bin/docker', '/opt/homebrew/bin/docker', 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'];

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, Object.assign({ maxBuffer: 50 * 1024 * 1024 }, opts), (err, stdout, stderr) => {
            if (err) { err.stderr = String(stderr || ''); return reject(err); }
            resolve(String(stdout));
        });
    });
}

/** Find a working docker binary with a running daemon. Returns its path or throws a friendly error. */
async function findDocker(exec = run) {
    let installed = false;
    for (const cand of DOCKER_CANDIDATES) {
        try {
            await exec(cand, ['info', '--format', '{{.ServerVersion}}']);
            return cand;
        } catch (e) {
            if (e.code !== 'ENOENT') installed = true;
        }
    }
    throw new Error(installed
        ? 'Docker is installed but not running. Open Docker Desktop, wait until it says "running", then try again.'
        : 'Docker is not installed. Install Docker Desktop to stitch a field map, or use "Quick map" instead.');
}

/** Arguments for the OpenDroneMap run (exported for tests). */
function odmArgs(workDir, opts = {}) {
    const geo = opts.geo && opts.geo.length ? ['--geo', '/datasets/project/geo.txt'] : [];
    const rerun = opts.rerunFrom ? ['--rerun-from', opts.rerunFrom] : [];
    return [
        'run', '--rm',
        '-v', path.resolve(workDir) + ':/datasets',
        ODM_IMAGE,
        '--project-path', '/datasets', 'project',
        '--fast-orthophoto',          // no 3D model: much faster, fine for flat fields
        '--skip-3dmodel', '--skip-report',
        '--feature-quality', opts.featureQuality || 'medium',   // fast enough for a laptop; plenty for flat fields
        // ODM never goes finer than the photos' own ground resolution, so 2 cm means "as sharp as the photos"
        '--orthophoto-resolution', String(opts.resolutionCm || 2)
    ].concat(geo, rerun);
}

function gdalArgs(workDir, tool, args) {
    return ['run', '--rm', '-v', path.resolve(workDir) + ':/datasets', '--entrypoint', tool, ODM_IMAGE].concat(args);
}

/**
 * Run OpenDroneMap on the photos in imagesDir. Writes into workDir:
 *   project/images/*        (copies of the photos)
 *   project/odm_orthophoto/odm_orthophoto.tif   (ODM output, UTM)
 *   ortho_wgs84.tif         (re-projected to lat/lng so it lines up with the map)
 *   ortho.png, edges.json   (for display)
 * onLog(line) receives ODM progress lines.
 * opts.geo: [{name, lat, lng, alt}] positions for photos whose files have no GPS (written to geo.txt).
 */
async function stitchWithODM(imagesDir, workDir, opts = {}) {
    const docker = opts.docker || await findDocker();
    const imgOut = path.join(workDir, 'project', 'images');
    fs.mkdirSync(imgOut, { recursive: true });
    const photos = fs.readdirSync(imagesDir).filter(f => /\.jpe?g$/i.test(f));
    if (photos.length < 5) throw new Error('Stitching needs at least 5 overlapping photos; found ' + photos.length + '. Use "Quick map" for a few photos.');
    photos.forEach(f => fs.copyFileSync(path.join(imagesDir, f), path.join(imgOut, f)));
    if (opts.geo && opts.geo.length) {
        fs.writeFileSync(path.join(workDir, 'project', 'geo.txt'), 'EPSG:4326\n' +
            opts.geo.map(g => [g.name, g.lng, g.lat, g.alt != null ? g.alt : ''].join(' ').trim()).join('\n') + '\n');
    }

    const runODM = o => new Promise((resolve, reject) => {
        const p = spawn(docker, odmArgs(workDir, o));
        const onData = d => String(d).split('\n').filter(Boolean).forEach(l => opts.onLog && opts.onLog(l));
        p.stdout.on('data', onData);
        p.stderr.on('data', onData);
        p.on('error', reject);
        p.on('close', code => {
            if (code === 0) return resolve();
            const e = new Error(code === 137
                ? 'Docker ran out of memory. In Docker Desktop, open Settings > Resources and give it more memory (8 GB or more), then try again.'
                : 'OpenDroneMap stopped with code ' + code + '. Check that the photos overlap and have GPS.');
            e.code = code === 137 ? 'ODM_OUT_OF_MEMORY' : 'ODM_FAILED';
            reject(e);
        });
    });
    let note = null;
    const resolutionCm = opts.resolutionCm || 2;
    try {
        await runODM(Object.assign({}, opts, { resolutionCm }));
    } catch (e) {
        // Texturing the map needs the most memory, and less at a coarser resolution. Keep the finished
        // 3D reconstruction and try once more at 4 cm per pixel.
        if (e.code !== 'ODM_OUT_OF_MEMORY' || resolutionCm >= RETRY_RESOLUTION_CM || opts.retry === false) throw e;
        if (opts.onLog) opts.onLog('Out of memory at ' + resolutionCm + ' cm per pixel; trying again at ' + RETRY_RESOLUTION_CM + ' cm.');
        await runODM(Object.assign({}, opts, { resolutionCm: RETRY_RESOLUTION_CM, rerunFrom: 'odm_meshing' }));
        note = 'Docker ran out of memory, so the map was made at ' + RETRY_RESOLUTION_CM + ' cm per pixel instead of ' + resolutionCm +
            ' cm. For a sharper map, give Docker Desktop more memory (Settings > Resources, 8 GB or more).';
    }

    const odmOrtho = path.join(workDir, 'project', 'odm_orthophoto', 'odm_orthophoto.tif');
    if (!fs.existsSync(odmOrtho)) throw new Error('OpenDroneMap finished but produced no orthophoto.');
    // Re-project to latitude/longitude and read the bounds with GDAL's Python bindings inside the ODM
    // image (the image has no gdalinfo on its PATH; checked against opendronemap/odm:3.6.2).
    // Pixel sizes are chosen so one pixel stays square on the ground (same cm east-west and north-south).
    const py = [
        'import math',
        'from osgeo import gdal',
        'src = gdal.Open("/datasets/project/odm_orthophoto/odm_orthophoto.tif")',
        'res = abs(src.GetGeoTransform()[1])',
        'v = gdal.Warp("", src, format="VRT", dstSRS="EPSG:4326")',
        'vt = v.GetGeoTransform()',
        'lat = vt[3] + vt[5] * v.RasterYSize / 2',
        'd = gdal.Warp("/datasets/ortho_wgs84.tif", src, dstSRS="EPSG:4326", xRes=res / (111320 * math.cos(math.radians(lat))), yRes=res / 111320, resampleAlg="bilinear", creationOptions=["COMPRESS=DEFLATE", "TILED=YES", "BIGTIFF=IF_SAFER"])',
        't = d.GetGeoTransform()',
        'print("BOUNDS", t[0], t[3], t[0] + t[1] * d.RasterXSize, t[3] + t[5] * d.RasterYSize)'
    ].join('\n');
    const outText = await run(docker, gdalArgs(workDir, 'python3', ['-c', py]));
    const m = outText.match(/BOUNDS\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
    if (!m) throw new Error('Could not read the orthophoto position.');
    const [west, north, east, south] = m.slice(1).map(Number);
    const bounds = { west, north, east, south };
    const res = await finishOrtho(path.join(workDir, 'ortho_wgs84.tif'), workDir, bounds);
    if (note) res.note = note;
    return res;
}

async function finishOrtho(tif, workDir, bounds) {
    const sharp = require('sharp');
    const png = path.join(workDir, 'ortho.png');
    await sharp(tif, { limitInputPixels: false }).resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true }).png().toFile(png);
    const edges = { Upper_left_corner: [bounds.north, bounds.west], Lower_right_corner: [bounds.south, bounds.east] };
    fs.writeFileSync(path.join(workDir, 'edges.json'), JSON.stringify(edges));
    fs.writeFileSync(path.join(workDir, 'map.json'), JSON.stringify({ type: 'ortho', image: 'ortho.png', bounds }, null, 2));
    return { type: 'ortho', image: png, bounds };
}

/**
 * North-up ground footprint of a nadir photo centred on (lat,lng) taken from `height` m.
 */
function photoBounds(lat, lng, height, camera) {
    const fp = footprint(height, camera);
    const dLat = (fp.length / 2) / 111320;
    const dLng = (fp.width / 2) / (111320 * Math.cos(lat * Math.PI / 180));
    return { north: lat + dLat, south: lat - dLat, east: lng + dLng, west: lng - dLng };
}

/**
 * Quick map without Docker: place every photo (with GPS) by its footprint.
 * Uses the planned flight height (EXIF altitude is above sea level, not above the field).
 */
function quickMap(photos, workDir, opts = {}) {
    fs.mkdirSync(workDir, { recursive: true });
    const height = opts.height || 30;
    const tiles = photos.filter(p => p.lat != null).map(p => ({
        photo: p.name,
        bounds: photoBounds(p.lat, p.lng, height, opts.camera)
    }));
    if (!tiles.length) throw new Error('None of the photos have a GPS position. Check that GPS was on when they were taken.');
    const all = tiles.reduce((b, t) => ({
        north: Math.max(b.north, t.bounds.north), south: Math.min(b.south, t.bounds.south),
        east: Math.max(b.east, t.bounds.east), west: Math.min(b.west, t.bounds.west)
    }), { north: -90, south: 90, east: -180, west: 180 });
    const map = { type: 'photos', height, tiles, bounds: all };
    fs.writeFileSync(path.join(workDir, 'map.json'), JSON.stringify(map, null, 2));
    return map;
}

module.exports = { findDocker, stitchWithODM, quickMap, photoBounds, odmArgs, gdalArgs, ODM_IMAGE };
