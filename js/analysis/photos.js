// Import Potensic Atom 2 photos into a CoFly project.
// The Atom 2 has no live image link: photos are taken by the Eve mission and stored on the drone's
// microSD card (or downloaded to the phone with Eve). This module copies them into the project and
// reads each photo's GPS position from its EXIF data.

const fs = require('fs');
const path = require('path');
const piexif = require('piexifjs');

const PHOTO_EXT = /\.(jpe?g)$/i;

function dmsToDeg(dms, ref) {
    if (!dms || dms.length < 3) return null;
    const [d, m, s] = dms.map(([n, den]) => (den ? n / den : 0));
    const deg = d + m / 60 + s / 3600;
    return (ref === 'S' || ref === 'W') ? -deg : deg;
}

// Horizontal field of view (degrees) by camera. Potensic does not publish the Atom 2 photo FOV;
// ~80° is typical for its class and can be overridden on import.
const CAMERAS = [
    { match: /FC6310/i, name: 'DJI Phantom 4 Pro', hfovDeg: 73.7 },
    { match: /ATOM\s*2|Potensic/i, name: 'Potensic Atom 2', hfovDeg: 80 }
];
const DEFAULT_CAMERA = { name: 'Unknown camera', hfovDeg: 80 };

function cameraFor(make, model) {
    const id = (make || '') + ' ' + (model || '');
    return CAMERAS.find(c => c.match.test(id)) || DEFAULT_CAMERA;
}

function bearing(a, b) {
    const toR = d => d * Math.PI / 180;
    const y = Math.sin(toR(b.lng - a.lng)) * Math.cos(toR(b.lat));
    const x = Math.cos(toR(a.lat)) * Math.sin(toR(b.lat)) - Math.sin(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.cos(toR(b.lng - a.lng));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const metresBetween = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));

/**
 * Direction the top of each photo faced (degrees clockwise from north).
 * 'north': missions from this app point the Atom 2 north at every photo.
 * 'travel': the drone faced its direction of flight (typical for other mission apps).
 */
function assignHeadings(photos, orientation) {
    if (orientation === 'north') { photos.forEach(p => { p.heading = 0; }); return; }
    let last = 0;
    photos.forEach((p, i) => {
        if (p.lat == null) { p.heading = last; return; }
        const prev = photos.slice(0, i).reverse().find(q => q.lat != null);
        const next = photos.slice(i + 1).find(q => q.lat != null);
        const a = prev || p, b = next || p;
        if (metresBetween(a, b) > 0.3) last = bearing(a, b);
        p.heading = (last + (orientation === 'travel-reverse' ? 180 : 0)) % 360;
    });
}

/** Read GPS + time + camera from a JPEG. Returns {lat,lng,alt,time,make,model} with nulls when missing. */
function readPhotoInfo(file) {
    const out = { lat: null, lng: null, alt: null, time: null, make: null, model: null };
    try {
        const exif = piexif.load(fs.readFileSync(file).toString('binary'));
        const gps = exif.GPS || {};
        const G = piexif.GPSIFD;
        out.lat = dmsToDeg(gps[G.GPSLatitude], gps[G.GPSLatitudeRef]);
        out.lng = dmsToDeg(gps[G.GPSLongitude], gps[G.GPSLongitudeRef]);
        if (gps[G.GPSAltitude]) {
            const [n, d] = gps[G.GPSAltitude];
            out.alt = d ? n / d : null;
        }
        const t = exif.Exif && exif.Exif[piexif.ExifIFD.DateTimeOriginal];
        if (t) out.time = String(t);
        const z = exif['0th'] || {};
        if (z[piexif.ImageIFD.Make]) out.make = String(z[piexif.ImageIFD.Make]).replace(/\0/g, '').trim();
        if (z[piexif.ImageIFD.Model]) out.model = String(z[piexif.ImageIFD.Model]).replace(/\0/g, '').trim();
    } catch (e) {
        // not a JPEG with EXIF; leave nulls
    }
    if (out.lat === 0 && out.lng === 0) out.lat = out.lng = null;
    return out;
}

/** Width/height of a JPEG from its SOF marker (no decoding). */
function jpegSize(file) {
    const b = fs.readFileSync(file);
    for (let i = 2; i < b.length - 9;) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        i += 2 + len;
    }
    return { width: 4000, height: 3000 };
}

function listPhotos(dir) {
    return fs.readdirSync(dir).filter(f => PHOTO_EXT.test(f) && !f.startsWith('.')).sort();
}

/**
 * Copy photos from srcDir (e.g. the Atom 2 SD card's DCIM folder) into destDir.
 * Photos without GPS are matched, in time order, to the mission's photo waypoints when given.
 * Writes image_list.txt ("name lat lon alt" per line, CoFly's format) into destDir.
 * @returns {Array<{file,lat,lng,alt,time,gpsSource}>}
 */
function importPhotos(srcDir, destDir, opts = {}) {
    if (!fs.existsSync(srcDir)) throw new Error('Folder not found: ' + srcDir);
    let names = listPhotos(srcDir);
    if (opts.since) {
        names = names.filter(n => fs.statSync(path.join(srcDir, n)).mtimeMs >= opts.since);
    }
    if (!names.length) throw new Error('No JPG photos found in ' + srcDir + '. On the Atom 2 SD card they are in DCIM.');
    fs.mkdirSync(destDir, { recursive: true });

    const photos = names.map(name => {
        const src = path.join(srcDir, name);
        const info = readPhotoInfo(src);
        return Object.assign({ name, src, mtime: fs.statSync(src).mtimeMs }, info);
    }).sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.mtime - b.mtime || a.name.localeCompare(b.name));

    const waypoints = opts.missionWaypoints || [];
    let wpIndex = 0;
    const result = photos.map(p => {
        let gpsSource = 'exif';
        if (p.lat == null && waypoints[wpIndex]) {
            p.lat = waypoints[wpIndex].lat;
            p.lng = waypoints[wpIndex].lng;
            p.alt = p.alt != null ? p.alt : waypoints[wpIndex].height || null;
            gpsSource = 'mission';
        } else if (p.lat == null) {
            gpsSource = 'none';
        }
        wpIndex++;
        const dest = path.join(destDir, p.name);
        fs.copyFileSync(p.src, dest);
        const size = jpegSize(dest);
        const cam = opts.hfovDeg ? { name: 'custom', hfovDeg: opts.hfovDeg } : cameraFor(p.make, p.model);
        const height = opts.height || 30;
        const widthM = 2 * height * Math.tan(cam.hfovDeg / 2 * Math.PI / 180);
        return {
            file: dest, name: p.name, lat: p.lat, lng: p.lng, alt: p.alt, time: p.time, gpsSource,
            camera: cam.name, hfovDeg: cam.hfovDeg, pixelWidth: size.width, pixelHeight: size.height,
            height, widthM, heightM: widthM * size.height / size.width
        };
    });
    // Default: fixed heading (missions from this app face north; CoFly-WeedDB's DJI photos also kept one heading)
    assignHeadings(result, opts.orientation || 'north');

    const lines = result.filter(r => r.lat != null).map(r => r.name + ' ' + r.lat + ' ' + r.lng + ' ' + (r.alt != null ? r.alt : 0));
    fs.writeFileSync(path.join(destDir, 'image_list.txt'), lines.join('\n'), 'utf8');
    fs.writeFileSync(path.join(destDir, 'photos.json'), JSON.stringify(result.map(r => Object.assign({}, r, { file: r.name })), null, 2));
    return result;
}

module.exports = { readPhotoInfo, importPhotos, listPhotos, dmsToDeg, cameraFor, assignHeadings, bearing, jpegSize, CAMERAS };
