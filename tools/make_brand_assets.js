// Build app logo assets from logo/logo.png (green line art on white).
//   node tools/make_brand_assets.js
// img/brand/logo.png         transparent, trimmed (for light backgrounds)
// img/brand/logo-white.png   white line art, transparent (for dark/photo backgrounds)
// img/brand/app-icon.png     1024x1024 rounded tile for the Dock / window icon
// img/brand/favicon.png      64x64
const sharp = require('sharp');
const path = require('path');
const SRC = path.join(__dirname, '..', 'logo', 'logo.png');
const OUT = path.join(__dirname, '..', 'img', 'brand');

(async () => {
    const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    const rgba = Buffer.alloc(n * 4), white = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
        const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
        // opacity from distance to the white background; soft edge keeps anti-aliasing
        const a = Math.max(0, Math.min(1, (245 - Math.min(r, g, b)) / 70));
        const un = c => (a > 0 ? Math.max(0, Math.min(255, Math.round((c - (1 - a) * 255) / a))) : 0);
        rgba[i * 4] = un(r); rgba[i * 4 + 1] = un(g); rgba[i * 4 + 2] = un(b); rgba[i * 4 + 3] = Math.round(a * 255);
        white[i * 4] = white[i * 4 + 1] = white[i * 4 + 2] = 255; white[i * 4 + 3] = Math.round(a * 255);
    }
    const raw = buf => sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } });
    const trimmed = await raw(rgba).png().toBuffer().then(b => sharp(b).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true }));
    const box = { left: trimmed.info.trimOffsetLeft * -1, top: trimmed.info.trimOffsetTop * -1, width: trimmed.info.width, height: trimmed.info.height };
    await sharp(trimmed.data).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(OUT, 'logo.png'));
    await raw(white).extract(box).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(OUT, 'logo-white.png'));
    // app icon: logo on a warm white rounded tile with a soft border
    const tile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="64" y="64" width="896" height="896" rx="200" fill="#FBFAF5" stroke="#DCE5D6" stroke-width="6"/></svg>');
    const mark = await sharp(path.join(OUT, 'logo.png')).resize(700, 700).toBuffer();
    await sharp(tile).composite([{ input: mark, left: 162, top: 150 }]).png().toFile(path.join(OUT, 'app-icon.png'));
    await sharp(path.join(OUT, 'app-icon.png')).resize(64, 64).png().toFile(path.join(OUT, 'favicon.png'));
    console.log('trim box', box);
})();
