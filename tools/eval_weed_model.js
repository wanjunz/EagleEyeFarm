// Score weed detection on CoFly-WeedDB's 3 test splits with CoFly's metric (IoU per class, summed per split).
//   MODEL_DIR=<dir with weed_gbt_split{1,2,3}.json> node tools/eval_weed_model.js . data/CoFly-WeedDB model
//   node tools/eval_weed_model.js . data/CoFly-WeedDB pixels        # the earlier row-based heuristic
// Score a weed detector on CoFly-WeedDB test splits with CoFly's metric (IoU per class, summed over the split).
// usage: node eval_weeds.js <repoRoot> <CoFly-WeedDB dir> [variant]
const fs = require('fs'), path = require('path');
const [root, db, variant = 'regions'] = process.argv.slice(2);
const sharp = require(path.join(root, 'node_modules/sharp'));
const weeds = require(path.join(root, 'js/analysis/weeds'));   // earlier heuristic (variant 'pixels')
const W = 640, H = 360;

async function loadLabel(file) {
    const { data, info } = await sharp(file).resize(W, H, { kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
    const m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = data[i * info.channels] > 0 ? 1 : 0;
    return m;
}

const weedModel = require(path.join(root, 'js/analysis/weed_model'));
async function predict(file, split) {
    if (variant === 'model') {
        const model = weedModel.loadModel(path.join(process.env.MODEL_DIR, 'weed_gbt_split' + split + '.json'));
        const big = await sharp(file).resize(1280, 720).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const m = weedModel.predictMask(big.data, 1280, 720, big.info.channels, model);
        const small = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) small[y * W + x] = m[(y * 2) * 1280 + x * 2];
        return small;
    }
    const { data, info } = await sharp(file).resize(W, H).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const res = weeds.analyzePixels(data, W, H, info.channels, { metresPerPx: 7.5 / W });
    return variant === 'pixels' ? res.weedPixels || res.weeds : res.weeds;
}

(async () => {
    const have = new Set(fs.readdirSync(path.join(db, 'images')));
    const out = {};
    for (const split of [1, 2, 3]) {
        const list = fs.readFileSync(path.join(db, 'test_split' + split + '.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
            .map(s => path.basename(s)).filter(f => have.has(f) && fs.existsSync(path.join(db, 'labels_1d', f)));
        let iW = 0, uW = 0, iB = 0, uB = 0;
        for (const f of list) {
            const gt = await loadLabel(path.join(db, 'labels_1d', f));
            const pr = await predict(path.join(db, 'images', f), split);
            for (let i = 0; i < gt.length; i++) {
                const g = gt[i], p = pr[i] ? 1 : 0;
                if (g && p) iW++; if (g || p) uW++;
                if (!g && !p) iB++; if (!g || !p) uB++;
            }
        }
        const weed = 100 * iW / uW, bg = 100 * iB / uB;
        out['split' + split] = { images: list.length, background: +bg.toFixed(2), weed: +weed.toFixed(2), mIoU: +((weed + bg) / 2).toFixed(2) };
    }
    console.log(JSON.stringify({ variant, ...out }, null, 1));
})();
