// Pushes Atom 2 missions onto an Android phone running Potensic Eve, using adb.
//
// Eve deletes mission folders it did not create, so instead of adding a new folder we
// overwrite the files of a mission the user already made in Eve (any 1-point mission works).
// Requires: Android platform-tools (adb) on PATH, USB debugging enabled on the phone.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const EVE_WAYPOINT_DIR = '/sdcard/Android/data/com.ipotensic.atom/files/Waypoint';

// Apps started from the Dock/Finder do not get the shell PATH, so also look in the usual install places.
function findAdbPath() {
    const candidates = [
        '/opt/homebrew/bin/adb', '/usr/local/bin/adb',
        path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'),
        path.join(os.homedir(), 'AppData/Local/Android/Sdk/platform-tools/adb.exe')
    ];
    return candidates.find(c => fs.existsSync(c)) || 'adb';
}

function createAdb(opts = {}) {
    const adbPath = opts.adbPath || process.env.ADB_PATH || findAdbPath();
    const exec = opts.execFile || execFile;

    function run(args) {
        return new Promise((resolve, reject) => {
            exec(adbPath, args, { timeout: 20000 }, (err, stdout, stderr) => {
                if (err) {
                    const msg = err.code === 'ENOENT'
                        ? 'adb was not found. Install Android platform-tools (Mac: brew install android-platform-tools).'
                        : (String(stderr || err.message).trim() || 'adb failed');
                    return reject(new Error(msg));
                }
                resolve(String(stdout));
            });
        });
    }

    async function checkAdb() {
        const out = await run(['devices']);
        const devices = out.split('\n').slice(1).map(l => l.trim()).filter(Boolean);
        const ready = devices.filter(l => /\tdevice$/.test(l));
        if (devices.some(l => /\tunauthorized$/.test(l))) {
            throw new Error('Phone found but not authorised. Unlock it and accept the "Allow USB debugging" prompt.');
        }
        if (!ready.length) throw new Error('No Android phone found. Connect it by USB and enable USB debugging.');
        return ready.map(l => l.split('\t')[0]);
    }

    async function listMissions() {
        let out;
        try {
            out = await run(['shell', 'ls', '-1', EVE_WAYPOINT_DIR]);
        } catch (e) {
            throw new Error('Could not read Eve missions. Is Potensic Eve installed and has it saved at least one waypoint mission? (' + e.message + ')');
        }
        return out.split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s))
            .map(id => ({ id, created: new Date(Number(id)).toISOString() }))
            .sort((a, b) => Number(b.id) - Number(a.id));
    }

    /**
     * Overwrite an existing Eve mission with our files.
     * @param {string} targetId  id of a mission already created in Eve
     * @param {object} serialized  output of potensic_atom2.serialize(mission, targetId)
     */
    async function pushMission(targetId, serialized) {
        if (!/^\d+$/.test(String(targetId))) throw new Error('Mission id must be digits only');
        if (serialized.missionId !== String(targetId)) throw new Error('Serialize the mission with the target mission id');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atom2-'));
        try {
            const remoteDir = EVE_WAYPOINT_DIR + '/' + targetId;
            for (const [name, content] of Object.entries(serialized.files)) {
                const local = path.join(tmp, name);
                fs.writeFileSync(local, content);
                await run(['push', local, remoteDir + '/' + name]);
            }
            // Eve keeps missions in memory; force-stop so it re-reads the files on next launch.
            await run(['shell', 'am', 'force-stop', 'com.ipotensic.atom']).catch(() => {});
            return { remoteDir, files: Object.keys(serialized.files) };
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }

    return { checkAdb, listMissions, pushMission, run };
}

module.exports = { createAdb, EVE_WAYPOINT_DIR };
