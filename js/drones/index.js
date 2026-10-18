// Potensic Atom 2 helpers + the shared "what3words -> photo mission" flow used by the GUI, CLI and web page.

const w3w = require('../w3w/what3words');
const atom2 = require('./potensic_atom2');
const { createAdb } = require('./adb_transfer');


/**
 * Resolve a what3words address and build a one-photo Atom 2 mission for it.
 * @returns {Promise<{location, mission, errors, card}>}
 */
async function planW3WPhoto(words, opts = {}) {
    const location = await w3w.convertToCoordinates(words, { apiKey: opts.apiKey, mock: opts.mock, fetchImpl: opts.fetchImpl });
    const mission = atom2.buildPhotoMission({ lat: location.lat, lng: location.lng, label: '///' + location.words }, {
        height: opts.height != null ? Number(opts.height) : 30,
        gimbalPitch: opts.gimbalPitch != null ? Number(opts.gimbalPitch) : -90,
        hoverTime: opts.hoverTime != null ? Number(opts.hoverTime) : 3
    });
    const errors = atom2.validate(mission, { home: opts.home, maxDistance: opts.maxDistance });
    const card = atom2.manualEntryCard(mission, location);
    return { location, mission, errors, card };
}

/** Analyse the photo taken at a what3words square (crop health + weeds). */
function analyzeSinglePhoto(file, outDir, opts) {
    return require('../analysis/pipeline').analyzeSinglePhoto(file, outDir, opts);
}

module.exports = { planW3WPhoto, analyzeSinglePhoto, createAdb, atom2, w3w };
