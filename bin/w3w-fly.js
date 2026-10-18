#!/usr/bin/env node
// Turn a what3words address into a Potensic Atom 2 photo mission.
//
//   node bin/w3w-fly.js ///filled.count.soap [--height 30] [--pitch -90] [--hover 3]
//                       [--out ./missions] [--mission <eve id> --push] [--list] [--mock]
//
// Without --push it writes the mission files and prints the manual "Enter in Eve" card (iPhone).
// With --push it overwrites an existing Eve mission on a USB-connected Android phone via adb.

const fs = require('fs');
const path = require('path');
const { planW3WPhoto, createAdb, atom2 } = require('../js/drones');

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) args[key] = true;
            else { args[key] = next; i++; }
        } else args._.push(a);
    }
    return args;
}

function usage() {
    console.log(`Usage: w3w-fly <///three.word.address> [options]

Options:
  --height <m>      flight height above take-off (default 30, max 120)
  --pitch <deg>     gimbal pitch, -90 = straight down (default -90)
  --hover <s>       hover time before the photo (default 3)
  --out <dir>       folder to write mission files (default ./missions)
  --list            list missions saved in Eve on the connected Android phone
  --mission <id>    Eve mission to overwrite (create any 1-point mission in Eve first)
  --push            push the mission to the phone with adb (Android only)
  --mock            use offline test fixtures instead of the what3words API
  --key <key>       what3words API key (or set W3W_API_KEY)`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || args.h) return usage();
    const adb = createAdb();

    if (args.list) {
        await adb.checkAdb();
        const missions = await adb.listMissions();
        if (!missions.length) console.log('No missions found. Create one in Potensic Eve first.');
        missions.forEach(m => console.log(m.id + '  (created ' + m.created + ')'));
        return;
    }

    const words = args._[0];
    if (!words) { usage(); process.exitCode = 1; return; }

    const plan = await planW3WPhoto(words, {
        apiKey: args.key, mock: args.mock ? true : undefined,
        height: args.height, gimbalPitch: args.pitch, hoverTime: args.hover
    });
    if (plan.errors.length) {
        console.error('Mission is not safe to fly:\n  - ' + plan.errors.join('\n  - '));
        process.exitCode = 1;
        return;
    }

    const { location, card } = plan;
    console.log('///' + location.words + '  ->  ' + location.lat + ', ' + location.lng + (location.nearestPlace ? '  (near ' + location.nearestPlace + ')' : ''));
    console.log('Map: ' + card.mapLink + '\n');

    const missionId = args.mission ? String(args.mission) : String(Date.now());
    const serialized = atom2.serialize(plan.mission, missionId);
    const outDir = path.resolve(args.out || 'missions', missionId);
    fs.mkdirSync(outDir, { recursive: true });
    for (const [name, content] of Object.entries(serialized.files)) fs.writeFileSync(path.join(outDir, name), content);
    fs.writeFileSync(path.join(outDir, 'enter-in-eve.json'), JSON.stringify(card, null, 2));
    console.log('Mission files written to ' + outDir);

    if (args.push) {
        if (!args.mission) throw new Error('--push needs --mission <id>. Run with --list to see missions saved in Eve.');
        await adb.checkAdb();
        const ids = (await adb.listMissions()).map(m => m.id);
        if (!ids.includes(missionId)) throw new Error('Mission ' + missionId + ' is not in Eve. Run --list to see valid ids.');
        const res = await adb.pushMission(missionId, serialized);
        console.log('\nPushed to ' + res.remoteDir);
        console.log('Now open Potensic Eve > Waypoints, open that mission, check the point is on the what3words square, and tap Start.');
    } else {
        console.log('\nTo fly it by hand in Potensic Eve (iPhone or Android):');
        card.steps.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s));
    }
}

main().catch(err => {
    console.error('Error: ' + err.message);
    process.exitCode = 1;
});
