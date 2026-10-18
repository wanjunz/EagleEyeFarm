// Stitch photos (or per-photo analysis layers) into one north-up field map by GPS position.
//
// Each tile is placed at its photo's GPS position, sized from the flight height and camera field of
// view, and rotated to the direction the top of the photo faced. Works without Docker; for the
// sharper feature-matched orthophoto use OpenDroneMap (stitching.js).

const fs = require('fs');
const path = require('path');

const R = 6378137;

function localFrame(origin) {
    const k = Math.cos(origin.lat * Math.PI / 180);
    return {
        toEN: (lat, lng) => ({ e: (lng - origin.lng) * Math.PI / 180 * R * k, n: (lat - origin.lat) * Math.PI / 180 * R }),
        toLL: (e, n) => ({ lat: origin.lat + n / R * 180 / Math.PI, lng: origin.lng + e / (R * k) * 180 / Math.PI })
    };
}

/** Image-frame offset (right, up) in metres -> east/north, for a photo whose top faces `heading`° (clockwise from north). */
function rotateToEN(dx, dy, heading) {
    const h = (heading || 0) * Math.PI / 180;
    return { e: dx * Math.cos(h) + dy * Math.sin(h), n: -dx * Math.sin(h) + dy * Math.cos(h) };
}

/** Lat/lng of pixel (x,y) in a photo of size (w,h) px covering widthM x heightM, centred at (lat,lng). */
function photoPixelToLatLng(tile, x, y, w, h) {
    const dx = (x / w - 0.5) * tile.widthM, dy = (0.5 - y / h) * tile.heightM;
    const en = rotateToEN(dx, dy, tile.heading);
    return localFrame(tile).toLL(en.e, en.n);
}

/** Corner points (east/north metres) of a tile footprint in a given local frame. */
function tileCorners(tile, frame) {
    const c = frame.toEN(tile.lat, tile.lng);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
        const r = rotateToEN(sx * tile.widthM / 2, sy * tile.heightM / 2, tile.heading);
        return { e: c.e + r.e, n: c.n + r.n };
    });
}

/**
 * Plan the canvas for a set of tiles: bounds, size and metres per pixel.
 * tiles: [{lat, lng, heading, widthM, heightM, pixelWidth?}]
 */
function layout(tiles, opts = {}) {
    if (!tiles.length) throw new Error('No photos with GPS to stitch.');
    const origin = { lat: tiles.reduce((s, t) => s + t.lat, 0) / tiles.length, lng: tiles.reduce((s, t) => s + t.lng, 0) / tiles.length };
    const frame = localFrame(origin);
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    tiles.forEach(t => tileCorners(t, frame).forEach(p => {
        minE = Math.min(minE, p.e); maxE = Math.max(maxE, p.e); minN = Math.min(minN, p.n); maxN = Math.max(maxN, p.n);
    }));
    const native = Math.min(...tiles.map(t => t.widthM / (t.pixelWidth || 1000)));
    const maxPx = opts.maxPx || 6000;
    const mpp = Math.max(opts.metresPerPx || native, (maxE - minE) / maxPx, (maxN - minN) / maxPx);
    const pad = 2;
    const width = Math.ceil((maxE - minE) / mpp) + 2 * pad, height = Math.ceil((maxN - minN) / mpp) + 2 * pad;
    const nw = frame.toLL(minE - pad * mpp, maxN + pad * mpp), se = frame.toLL(minE - pad * mpp + width * mpp, maxN + pad * mpp - height * mpp);
    return { origin, frame, minE: minE - pad * mpp, maxN: maxN + pad * mpp, mpp, width, height, bounds: { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng } };
}

/**
 * Render one mosaic layer. tiles[i].image is a file path or {data, width, height, channels} raw buffer.
 * Tiles later in the list are drawn on top.
 */
async function render(tiles, outFile, lay, opts = {}) {
    const sharp = require('sharp');
    const comps = [];
    for (const t of tiles) {
        const wPx = Math.max(1, Math.round(t.widthM / lay.mpp)), hPx = Math.max(1, Math.round(t.heightM / lay.mpp));
        let img = typeof t.image === 'string' ? sharp(t.image) : sharp(t.image.data, { raw: { width: t.image.width, height: t.image.height, channels: t.image.channels } });
        let buf = await img.ensureAlpha().resize(wPx, hPx, { fit: 'fill' })
            .rotate(t.heading || 0, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
        const c = lay.frame.toEN(t.lat, t.lng);
        let left = Math.round((c.e - lay.minE) / lay.mpp - buf.info.width / 2);
        let top = Math.round((lay.maxN - c.n) / lay.mpp - buf.info.height / 2);
        // keep inside the canvas (rounding can push a tile 1-2 px outside)
        const cropL = Math.max(0, -left), cropT = Math.max(0, -top);
        const cropR = Math.max(0, left + buf.info.width - lay.width), cropB = Math.max(0, top + buf.info.height - lay.height);
        if (cropL || cropT || cropR || cropB) {
            buf = await sharp(buf.data).extract({ left: cropL, top: cropT, width: buf.info.width - cropL - cropR, height: buf.info.height - cropT - cropB })
                .png().toBuffer({ resolveWithObject: true });
            left += cropL; top += cropT;
        }
        comps.push({ input: buf.data, left, top });
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    // composite in batches to keep memory use moderate
    let canvas = await sharp({ create: { width: lay.width, height: lay.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    for (let i = 0; i < comps.length; i += 60) {
        canvas = await sharp(canvas).composite(comps.slice(i, i + 60)).png().toBuffer();
    }
    await sharp(canvas).png({ compressionLevel: opts.fast ? 2 : 6 }).toFile(outFile);
    return outFile;
}

module.exports = { layout, render, photoPixelToLatLng, tileCorners, localFrame, rotateToEN };
