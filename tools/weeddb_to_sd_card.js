// Turn CoFly-WeedDB photos into an "SD card" of JPEGs with GPS/time/camera EXIF (read from the file names),
// so the app's import -> analyse -> stitch workflow can be tested on the real Greek cotton field.
//   node tools/weeddb_to_sd_card.js . data/CoFly-WeedDB/images data/greece_sd/DCIM
// CoFly-WeedDB PNGs -> JPEGs with EXIF GPS/time/camera from the file name (like photos off a drone SD card).
const fs = require('fs'), path = require('path');
const [root, src, dst] = process.argv.slice(2);
const sharp = require(path.join(root, 'node_modules/sharp')), piexif = require(path.join(root, 'node_modules/piexifjs'));
const toDms = deg => { const a = Math.abs(deg), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60 * 1e6); return [[d, 1], [m, 1], [s, 1e6]]; };
(async () => {
  let n = 0;
  for (const f of fs.readdirSync(src).filter(x => x.endsWith('.png')).sort()) {
    const m = f.match(/ID_(\d+)_.*Lat=([\d.]+),Lon=([\d.]+),Alt=([\d.]+)\]_DATE_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)/);
    if (!m) continue;
    const [, id, lat, lon, alt, dd, mo, yy, hh, mi, ss] = m;
    const jpg = await sharp(path.join(src, f)).jpeg({ quality: 90 }).toBuffer();
    const exif = {
      '0th': { [piexif.ImageIFD.Make]: 'DJI', [piexif.ImageIFD.Model]: 'FC6310' },
      Exif: { [piexif.ExifIFD.DateTimeOriginal]: `${yy}:${mo}:${dd} ${hh}:${mi}:${ss}` },
      GPS: { [piexif.GPSIFD.GPSLatitudeRef]: 'N', [piexif.GPSIFD.GPSLatitude]: toDms(+lat), [piexif.GPSIFD.GPSLongitudeRef]: 'E',
             [piexif.GPSIFD.GPSLongitude]: toDms(+lon), [piexif.GPSIFD.GPSAltitude]: [Math.round(+alt * 100), 100] }
    };
    fs.writeFileSync(path.join(dst, 'DJI_' + id + '.JPG'), Buffer.from(piexif.insert(piexif.dump(exif), jpg.toString('binary')), 'binary'));
    n++;
  }
  console.log('wrote', n, 'photos');
})();
