const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { createAdb, EVE_WAYPOINT_DIR } = require('../js/drones/adb_transfer');
const atom2 = require('../js/drones/potensic_atom2');

// Fake execFile: records calls and answers from a table keyed by the first adb argument(s).
function fakeExec(responses, calls) {
    return (cmd, args, opts, cb) => {
        calls.push({ cmd, args });
        if (args[0] === 'push') calls[calls.length - 1].content = fs.readFileSync(args[1], 'utf8');
        const r = responses[args.slice(0, 2).join(' ')] || responses[args[0]] || { stdout: '' };
        setImmediate(() => cb(r.err || null, r.stdout || '', r.stderr || ''));
    };
}

test('checkAdb finds devices and explains unauthorised / missing phones', async () => {
    const calls = [];
    let adb = createAdb({ execFile: fakeExec({ devices: { stdout: 'List of devices attached\nR58N123\tdevice\n' } }, calls) });
    assert.deepStrictEqual(await adb.checkAdb(), ['R58N123']);

    adb = createAdb({ execFile: fakeExec({ devices: { stdout: 'List of devices attached\nR58N123\tunauthorized\n' } }, []) });
    await assert.rejects(adb.checkAdb(), /Allow USB debugging/);

    adb = createAdb({ execFile: fakeExec({ devices: { stdout: 'List of devices attached\n\n' } }, []) });
    await assert.rejects(adb.checkAdb(), /No Android phone/);

    const enoent = Object.assign(new Error('spawn adb ENOENT'), { code: 'ENOENT' });
    adb = createAdb({ execFile: fakeExec({ devices: { err: enoent } }, []) });
    await assert.rejects(adb.checkAdb(), /platform-tools/);
});

test('listMissions returns numeric Eve mission folders, newest first', async () => {
    const calls = [];
    const adb = createAdb({ execFile: fakeExec({ 'shell ls': { stdout: '1739000000000\n1740000000000\nthumbs\n' } }, calls) });
    const missions = await adb.listMissions();
    assert.deepStrictEqual(missions.map(m => m.id), ['1740000000000', '1739000000000']);
    assert.deepStrictEqual(calls[0].args, ['shell', 'ls', '-1', EVE_WAYPOINT_DIR]);
});

test('pushMission overwrites both files in the target folder, then restarts Eve', async () => {
    const calls = [];
    const adb = createAdb({ execFile: fakeExec({}, calls) });
    const serialized = atom2.serialize(atom2.buildPhotoMission({ lat: 1, lng: 2 }), '1739000000000');
    const res = await adb.pushMission('1739000000000', serialized);
    assert.strictEqual(res.remoteDir, EVE_WAYPOINT_DIR + '/1739000000000');
    const pushes = calls.filter(c => c.args[0] === 'push');
    assert.deepStrictEqual(pushes.map(p => p.args[2]).sort(), [
        EVE_WAYPOINT_DIR + '/1739000000000/1739000000000.json',
        EVE_WAYPOINT_DIR + '/1739000000000/global.json'
    ]);
    assert.strictEqual(pushes.find(p => p.args[2].endsWith('global.json')).content, serialized.files['global.json']);
    assert.deepStrictEqual(calls[calls.length - 1].args, ['shell', 'am', 'force-stop', 'com.ipotensic.atom']);
});

test('pushMission rejects unsafe ids and mismatched serialization', async () => {
    const adb = createAdb({ execFile: fakeExec({}, []) });
    const serialized = atom2.serialize(atom2.buildPhotoMission({ lat: 1, lng: 2 }), '1739000000000');
    await assert.rejects(adb.pushMission('1;rm -rf /', serialized), /digits only/);
    await assert.rejects(adb.pushMission('1740000000000', serialized), /target mission id/);
});
