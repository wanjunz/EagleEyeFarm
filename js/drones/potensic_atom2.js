// Potensic Atom 2 waypoint mission builder.
//
// Potensic publishes no SDK for the Atom 2. Since firmware V020 the Potensic Eve app
// supports waypoint missions and stores each one on the phone (Android) as:
//   /sdcard/Android/data/com.ipotensic.atom/files/Waypoint/<id>/global.json
//   /sdcard/Android/data/com.ipotensic.atom/files/Waypoint/<id>/<id>.json   ->  "[waypoints];[pois]"
// The format was reverse engineered by the HOT Drone Tasking Manager project
// (spwoodcock.dev, hotosm/drone-tm PR #726). It is unofficial and may change with Eve updates.

const LIMITS = {
    maxHeight: 120,        // Eve caps height at 120 m above take-off in many countries
    minHeight: 2,
    minGimbal: -90,
    maxGimbal: 20,
    maxSpeed: 15,
    maxWaypoints: 99       // conservative default; the real cap is not documented
};

const FINISH_ACTIONS = ['RETURN', 'LAND', 'HOVER', 'BACK'];
const ACTIONS = ['PHOTO', 'START_RECORD', 'STOP_RECORD', 'NONE'];

function makeWaypoint(point, opts = {}) {
    return {
        lat: point.lat,
        lng: point.lng,
        height: opts.height,
        hoverTime: opts.hoverTime != null ? opts.hoverTime : 2,
        speedType: opts.speed != null ? 'DEFINE' : 'GLOBAL',
        speed: opts.speed != null ? opts.speed : 5,
        gimbalType: 'DEFINE',
        gimbalPitch: opts.gimbalPitch != null ? opts.gimbalPitch : -90,
        yawType: 'DEFINE',
        yaw: opts.yaw != null ? opts.yaw : 0,
        action: opts.action || 'PHOTO',
        zoomType: 'DEFINE',
        zoomRatio: 1,
        poiType: 'NONE',
        poiLat: 0,
        poiLng: 0,
        poiHeight: 0,
        fileName: ''
    };
}

function makeGlobal(opts = {}) {
    return {
        finishAction: opts.finishAction || 'RETURN',
        lostAction: 'RETURN',
        speed: opts.speed != null ? opts.speed : 5,
        isOrder: true,
        globalHeight: opts.height != null ? opts.height : 30,
        globalHeightType: 0
    };
}

/**
 * One-point mission: fly to the target (e.g. a what3words square), hover, take a photo, return.
 */
function buildPhotoMission(target, opts = {}) {
    const o = Object.assign({ height: 30, gimbalPitch: -90, hoverTime: 3, speed: 5, finishAction: 'RETURN' }, opts);
    const mission = {
        global: makeGlobal(o),
        waypoints: [makeWaypoint(target, Object.assign({}, o, { action: 'PHOTO' }))],
        pois: []
    };
    if (target.label) mission.label = target.label;
    return mission;
}

/**
 * Convert CoFly's calculated_path.json (coverage or hot-point path) into one or more Atom 2 missions.
 * Accepts the parsed DataObject.generated_path ({waypoints:[{lat,lng}], altitude, speed, "Gimbal Pitch"})
 * or a plain array of {lat,lng}.
 */
function buildCoverageMissions(path, opts = {}) {
    const points = Array.isArray(path) ? path : path.waypoints;
    const o = Object.assign({
        height: Array.isArray(path) ? 30 : (path.altitude || 30),
        speed: Array.isArray(path) ? 5 : Math.min(path.speed || 5, LIMITS.maxSpeed),
        gimbalPitch: Array.isArray(path) ? -90 : (path['Gimbal Pitch'] != null ? path['Gimbal Pitch'] : -90),
        hoverTime: 1,
        finishAction: 'RETURN',
        maxWaypoints: LIMITS.maxWaypoints
    }, opts);
    o.gimbalPitch = Math.max(LIMITS.minGimbal, Math.min(LIMITS.maxGimbal, o.gimbalPitch));

    const missions = [];
    for (let i = 0; i < points.length; i += o.maxWaypoints) {
        const chunk = points.slice(i, i + o.maxWaypoints);
        missions.push({
            global: makeGlobal(o),
            waypoints: chunk.map(p => makeWaypoint({ lat: p.lat, lng: p.lng != null ? p.lng : p.lon }, Object.assign({}, o, { action: 'PHOTO' }))),
            pois: []
        });
    }
    return missions;
}

function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Returns a list of problems (empty array = valid).
 * opts.home + opts.maxDistance (m) optionally check the target is within range of the take-off point.
 */
function validate(mission, opts = {}) {
    const errors = [];
    if (!FINISH_ACTIONS.includes(mission.global.finishAction)) errors.push('finishAction must be one of ' + FINISH_ACTIONS.join(', '));
    if (!mission.waypoints.length) errors.push('Mission has no waypoints');
    if (mission.waypoints.length > (opts.maxWaypoints || LIMITS.maxWaypoints)) errors.push('Too many waypoints (' + mission.waypoints.length + ')');
    mission.waypoints.forEach((w, i) => {
        const n = 'Waypoint ' + (i + 1) + ': ';
        if (!(w.lat >= -90 && w.lat <= 90) || !(w.lng >= -180 && w.lng <= 180)) errors.push(n + 'invalid coordinates');
        if (!(w.height >= LIMITS.minHeight && w.height <= LIMITS.maxHeight)) errors.push(n + 'height must be ' + LIMITS.minHeight + '-' + LIMITS.maxHeight + ' m');
        if (!(w.gimbalPitch >= LIMITS.minGimbal && w.gimbalPitch <= LIMITS.maxGimbal)) errors.push(n + 'gimbal pitch must be ' + LIMITS.minGimbal + ' to ' + LIMITS.maxGimbal);
        if (!(w.speed > 0 && w.speed <= LIMITS.maxSpeed)) errors.push(n + 'speed must be 0-' + LIMITS.maxSpeed + ' m/s');
        if (!ACTIONS.includes(w.action)) errors.push(n + 'unknown action ' + w.action);
        if (opts.home && opts.maxDistance) {
            const d = haversineMeters(opts.home, w);
            if (d > opts.maxDistance) errors.push(n + Math.round(d) + ' m from home, over the ' + opts.maxDistance + ' m limit');
        }
    });
    return errors;
}

/**
 * Serialize to the two files Eve reads. missionId is the folder/file name Eve uses (ms timestamp).
 */
function serialize(mission, missionId) {
    const id = String(missionId || Date.now());
    if (!/^\d+$/.test(id)) throw new Error('missionId must be digits only (Eve uses millisecond timestamps)');
    return {
        missionId: id,
        files: {
            'global.json': JSON.stringify(mission.global),
            [id + '.json']: JSON.stringify(mission.waypoints) + ';' + JSON.stringify(mission.pois || [])
        }
    };
}

/**
 * Human-readable steps for entering the mission by hand in Eve (iPhone, or Android without ADB).
 */
function manualEntryCard(mission, info = {}) {
    const w = mission.waypoints[0];
    const lat = w.lat.toFixed(6), lng = w.lng.toFixed(6);
    return {
        title: info.words ? '///' + info.words : 'Waypoint',
        nearestPlace: info.nearestPlace || '',
        lat: Number(lat),
        lng: Number(lng),
        height: w.height,
        gimbalPitch: w.gimbalPitch,
        hoverTime: w.hoverTime,
        action: w.action,
        mapLink: 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng,
        steps: [
            'Open Potensic Eve and connect to the Atom 2 (firmware V020 or newer).',
            'Tap the mission icon, choose Waypoints and start a new mission.',
            'Search or pan to ' + lat + ', ' + lng + ' (open the map link if it helps) and drop one waypoint there.',
            'Set height ' + w.height + ' m, gimbal ' + w.gimbalPitch + '°, hover ' + w.hoverTime + ' s, action: Take photo.',
            'Set the finish action to Return to Home, check the area is clear and in sight, then tap Start.'
        ]
    };
}

module.exports = {
    LIMITS, buildPhotoMission, buildCoverageMissions, validate, serialize, manualEntryCard, haversineMeters
};
