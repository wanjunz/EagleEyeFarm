# Synthetic GLI index maps with known problem patches, for comparing CoFly's detector and ours.
# 1000 x 750 px at 5 cm/px (50 m x 37.5 m). Healthy crop ~0.30 with row stripes and noise; bare soil ~0.0.
import numpy as np, json, os, sys
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(7)
H, W = 750, 1000

def field(rows=True):
    x = np.arange(W)[None, :].repeat(H, 0)
    base = np.full((H, W), 0.30, np.float32)
    if rows:  # crop rows every 0.9 m (18 px): inter-row soil strips are lower
        base = np.where((x % 18) < 7, 0.06, 0.34).astype(np.float32)
    return base + rng.normal(0, 0.03, (H, W)).astype(np.float32)

def disc(a, cx, cy, r, v):
    yy, xx = np.ogrid[:H, :W]
    a[(xx - cx) ** 2 + (yy - cy) ** 2 < r * r] = v + rng.normal(0, 0.02)
    return a

cases = {}
a = field(); disc(a, 250, 200, 60, -0.05); disc(a, 750, 520, 45, -0.05)
cases['two_patches'] = (a, [[250, 200], [750, 520]])
a = field(rows=False); disc(a, 250, 200, 60, -0.05); disc(a, 750, 520, 45, -0.05)
cases['two_patches_no_rows'] = (a, [[250, 200], [750, 520]])
a = field(); disc(a, 250, 200, 60, -0.05); disc(a, 750, 520, 45, -0.05); a[:, :80] = np.nan; a[:60, :] = np.nan
cases['two_patches_nodata_border'] = (a, [[250, 200], [750, 520]])
a = field()
cases['healthy_no_patches'] = (a, [])
a = field(); disc(a, 500, 375, 70, -0.05)
cases['one_patch'] = (a, [[500, 375]])
a = field(); disc(a, 250, 200, 60, -0.05); disc(a, 750, 520, 45, -0.05); disc(a, 600, 150, 3, -1.0)  # tiny very dark spot (shadow / dark object)
cases['two_patches_dark_spot'] = (a, [[250, 200], [750, 520]])
pts = [[150 + 220 * i, 150 + 200 * j] for i in range(4) for j in range(3)]
a = field()
for x, y in pts: disc(a, x, y, 30, -0.05)
cases['twelve_patches'] = (a, pts)

meta = {}
for name, (arr, truth) in cases.items():
    np.save(os.path.join(out, name + '.npy'), arr)
    arr.astype('<f4').tofile(os.path.join(out, name + '.f32'))
    meta[name] = {'truth': truth, 'width': W, 'height': H, 'metres_per_px': 0.05}
json.dump(meta, open(os.path.join(out, 'cases.json'), 'w'), indent=1)
print('cases:', list(meta))
