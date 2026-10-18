// Field summary: two headline numbers for the farmer.
//
//   Crop health (0-100) = share of the field that looks healthy. Each photo is split into areas of about
//     4 m x 4 m on the ground (several crop rows each, so row spacing does not look like gaps);
//     an area needs attention if its crop is thin (plant cover < 70% of the field's typical cover),
//     pale (plant greenness clearly below the field's typical value) or has stressed/bare patches
//     covering 25% or more of it.
//   Weeds (%) = share of the photographed field covered by likely weed patches (trained weed model).
//
// Crop health compares each part of the field with the rest of the same field, so it works across
// cameras and light conditions. It cannot tell whether a whole field is evenly stressed: compare
// scans over time for that.

/**
 * Green canopy pixels, Canopeo rule (Patrignani & Ochsner 2015, Agronomy Journal 107(6):2312-2320):
 * R/G < 0.95, B/G < 0.95 and 2G - R - B > 20. Fixed thresholds, so every photo is judged the same way.
 */
function canopyMask(rgba, n, channels) {
    const m = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += channels) {
        const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
        m[i] = g > 0 && r / g < 0.95 && b / g < 0.95 && 2 * g - r - b > 20 ? 1 : 0;
    }
    return m;
}
const { photoPixelToLatLng } = require('./mosaic');

const AREA_M = 4;          // target size of one assessed area on the ground
const THIN = 0.7;          // cover below 70% of the field median = thin crop
const PALE = 0.03;         // plant GLI more than 0.03 below the field median = pale crop
const PATCHY = 0.25;       // 25% or more of the area in stressed/bare patches
const NO_CROP = 0.05;      // typical green cover under 5%: bare soil or crop not up yet, nothing to score

/**
 * Per-area statistics for one photo.
 * rgba/width/height/channels: the photo (same size as gliValues); gliValues: GLI per pixel;
 * problemMask: 1 where the crop-health check found stressed/bare patches.
 */
function cellStats(rgba, width, height, channels, gliValues, problemMask, tile) {
    const veg = canopyMask(rgba, width * height, channels);
    const GRID_X = Math.max(1, Math.round(((tile && tile.widthM) || 30) / AREA_M));
    const GRID_Y = Math.max(1, Math.round(((tile && tile.heightM) || 22) / AREA_M));
    const cells = [];
    for (let gy = 0; gy < GRID_Y; gy++) {
        for (let gx = 0; gx < GRID_X; gx++) {
            const x0 = Math.floor(gx * width / GRID_X), x1 = Math.floor((gx + 1) * width / GRID_X);
            const y0 = Math.floor(gy * height / GRID_Y), y1 = Math.floor((gy + 1) * height / GRID_Y);
            let n = 0, nVeg = 0, gliSum = 0, prob = 0;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const i = y * width + x;
                if (channels === 4 && rgba[i * 4 + 3] === 0) continue;   // outside an orthomosaic
                n++;
                if (problemMask && problemMask[i]) prob++;
                if (veg[i] && !Number.isNaN(gliValues[i])) { nVeg++; gliSum += gliValues[i]; }
            }
            // skip areas mostly outside the stitched map (field edges), they would look thin
            if (n < 0.5 * (x1 - x0) * (y1 - y0)) continue;
            const cell = { cover: nVeg / n, plantGli: nVeg ? gliSum / nVeg : null, problem: prob / n };
            if (tile && tile.lat != null) {
                cell.corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => {
                    const ll = photoPixelToLatLng(tile, x, y, width, height);
                    return [+ll.lat.toFixed(7), +ll.lng.toFixed(7)];
                });
            }
            cells.push(cell);
        }
    }
    return cells;
}

const median = a => { const s = a.filter(v => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

const METHOD = 'Crop health = % of field areas without thin, pale or bare/stressed crop, compared with the field\'s own typical values. Weeds = % of field covered by likely weed patches.';

function rateHealth(score) { return score >= 85 ? 'Good' : score >= 65 ? 'Fair' : 'Poor'; }
function rateWeeds(pct) { return pct < 2 ? 'Low' : pct <= 10 ? 'Moderate' : 'High'; }

/**
 * Combine all photos' areas into the two headline numbers.
 * photos: [{ cells: [...], weedCover, weight? }]  (weight: share of field each one covers; default 1)
 */
function summarize(photos) {
    const cells = photos.flatMap(p => p.cells || []);
    if (!cells.length) return null;
    const coverMed = median(cells.map(c => c.cover));
    const gliMed = median(cells.map(c => c.plantGli));
    const n = cells.length;
    const wt = p => (p.weight != null ? p.weight : 1);
    const weedPct = 100 * photos.reduce((s, p) => s + wt(p) * (p.weedCover || 0), 0) / (photos.reduce((s, p) => s + wt(p), 0) || 1);
    const weeds = { pct: +weedPct.toFixed(1), rating: rateWeeds(weedPct) };
    const context = { areas: n, photos: photos.length, typicalCoverPct: +(100 * coverMed).toFixed(0), typicalPlantGli: gliMed != null ? +gliMed.toFixed(3) : null };
    if (coverMed < NO_CROP) {
        // comparing areas of bare soil with each other would only score soil colour
        return {
            cropHealth: { score: null, rating: 'No crop seen', attentionPct: 0, thinPct: 0, palePct: 0, patchyPct: 0,
                reason: 'Less than ' + (100 * NO_CROP) + '% of the field is green, so there is no crop to score (bare soil, or the crop is not up yet).' },
            weeds, context, attentionAreas: [], method: METHOD
        };
    }
    let thin = 0, pale = 0, patchy = 0, attention = 0;
    const attentionAreas = [];
    for (const c of cells) {
        const isThin = coverMed > 0 && c.cover < THIN * coverMed;
        const isPale = c.plantGli != null && gliMed != null && c.plantGli < gliMed - PALE;
        const isPatchy = c.problem >= PATCHY;
        if (isThin) thin++;
        if (isPale) pale++;
        if (isPatchy) patchy++;
        if (isThin || isPale || isPatchy) {
            attention++;
            if (c.corners) attentionAreas.push({ corners: c.corners, why: [isThin && 'thin crop', isPale && 'pale crop', isPatchy && 'bare/stressed patches'].filter(Boolean) });
        }
    }
    const health = Math.round(100 * (1 - attention / n));
    return {
        cropHealth: { score: health, rating: rateHealth(health), attentionPct: +(100 * attention / n).toFixed(1),
            thinPct: +(100 * thin / n).toFixed(1), palePct: +(100 * pale / n).toFixed(1), patchyPct: +(100 * patchy / n).toFixed(1) },
        weeds, context, attentionAreas, method: METHOD
    };
}

module.exports = { canopyMask, cellStats, summarize, rateHealth, rateWeeds, AREA_M, THIN, PALE, PATCHY, NO_CROP };
