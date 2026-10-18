"""Train the app's weed model on CoFly-WeedDB features (exported by tools/export_weed_features.js).

Two stages ("auto-context"): stage 1 predicts weed probability per cell from colour/texture/row features;
stage 2 sees the same features plus stage 1's probabilities over the cell's 3x3, 7x7 and 15x15
neighbourhood (and the 7x7 maximum), which suits CoFly-WeedDB's region-shaped weed labels.

usage: python train_weed_model.py <features dir> <CoFly-WeedDB dir> <out dir>

Writes, for each of CoFly's 3 published splits, weed_gbt_split<k>.json (trained on that split's training
photos only), and weed_gbt.json trained on all labelled photos (the model shipped in the app).
The decision threshold is chosen by 4-fold cross-validation on the training photos (grouped by photo),
never on the test photos.
Needs: numpy, scikit-learn.
"""
import json, os, sys
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import GroupKFold

feat_dir, db, out = sys.argv[1:4]
meta = json.load(open(os.path.join(feat_dir, 'meta.json')))
names, fnames = meta['images'], meta['features']
cells = np.array(meta['cells'], dtype=np.float64)          # image, cx, cy, weed fraction
X = np.fromfile(os.path.join(feat_dir, 'X.f32'), dtype='<f4').reshape(len(cells), len(fnames))
img, cx, cy, frac = cells[:, 0].astype(int), cells[:, 1].astype(int), cells[:, 2].astype(int), cells[:, 3]
y = (frac >= 0.5).astype(int)
cols, rows = cx.max() + 1, cy.max() + 1

def model():
    return HistGradientBoostingClassifier(max_iter=250, learning_rate=0.06, max_leaf_nodes=31,
                                          min_samples_leaf=40, l2_regularization=1.0, random_state=0)

def context(prob, idx):
    """Stage-1 probability context per cell: own, mean 3x3/7x7/15x15, max 7x7 (edge-replicated), per photo."""
    from scipy.ndimage import maximum_filter
    out = np.zeros((len(idx), 5))
    for k in np.unique(img[idx]):
        sel = np.where(img[idx] == k)[0]
        g = np.zeros((rows, cols)); g[cy[idx][sel], cx[idx][sel]] = prob[sel]
        def boxmean(r):
            p = np.pad(g, r, mode='edge'); c = np.cumsum(np.cumsum(p, 0), 1); c = np.pad(c, ((1, 0), (1, 0)))
            n = 2 * r + 1
            return (c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]) / (n * n)
        feats = [g, boxmean(1), boxmean(3), boxmean(7), maximum_filter(g, 7, mode='nearest')]
        out[sel] = np.stack([f[cy[idx][sel], cx[idx][sel]] for f in feats], 1)
    return out

def oof_probs(Xa, idx):
    o = np.zeros(len(idx))
    for tr, va in GroupKFold(n_splits=4).split(idx, groups=img[idx]):
        o[va] = model().fit(Xa[idx[tr]], y[idx[tr]]).predict_proba(Xa[idx[va]])[:, 1]
    return o

def fit_two_stage(train_idx):
    """Returns (stage1, stage2, X2 for train_idx built from out-of-fold stage-1 probabilities)."""
    s1 = model().fit(X[train_idx], y[train_idx])
    X2 = np.hstack([X[train_idx], context(oof_probs(X, train_idx), train_idx)])
    s2 = model().fit(X2, y[train_idx])
    return s1, s2, X2

def smooth(prob, idx):
    """3x3 mean of cell probabilities within each photo (same as the app)."""
    out = np.empty_like(prob)
    for k in np.unique(img[idx]):
        sel = np.where(img[idx] == k)[0]
        g = np.full((rows, cols), np.nan)
        g[cy[idx][sel], cx[idx][sel]] = prob[sel]
        p = np.pad(g, 1, constant_values=np.nan)
        stack = np.stack([p[1 + dy:1 + dy + rows, 1 + dx:1 + dx + cols] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
        sm = np.nanmean(stack, axis=0)
        out[sel] = sm[cy[idx][sel], cx[idx][sel]]
    return out

def iou_weed(prob, idx, t):
    """Pixel-weighted weed IoU using the labelled weed fraction of each cell."""
    pred = prob >= t
    f = frac[idx]
    inter = (f * pred).sum(); union = (pred.sum() + f.sum() - inter)
    return inter / union if union else 0.0

def choose_threshold(train_idx, X2):
    """Threshold for the smoothed stage-2 probability, from out-of-fold predictions on training photos."""
    oof = smooth(oof_probs_x(X2, train_idx), train_idx)
    ts = np.linspace(0.05, 0.7, 27)
    scores = [iou_weed(oof, train_idx, t) for t in ts]
    return float(ts[int(np.argmax(scores))]), float(max(scores))

def oof_probs_x(Xa, idx):
    """Out-of-fold probabilities where Xa rows align with idx (stage-2 matrix)."""
    o = np.zeros(len(idx))
    for tr, va in GroupKFold(n_splits=4).split(idx, groups=img[idx]):
        o[va] = model().fit(Xa[tr], y[idx[tr]]).predict_proba(Xa[va])[:, 1]
    return o

def trees_of(m):
    trees = []
    for it in m._predictors:
        n = it[0].nodes
        trees.append({'feature': n['feature_idx'].astype(int).tolist(), 'threshold': [float(v) for v in n['num_threshold']],
                      'left': n['left'].astype(int).tolist(), 'right': n['right'].astype(int).tolist(),
                      'leaf': n['is_leaf'].astype(int).tolist(), 'value': [round(float(v), 6) for v in n['value']]})
    return {'baseline': float(np.ravel(m._baseline_prediction)[0]), 'trees': trees}

def export(s1, s2, threshold, path, info):
    json.dump({'type': 'hist-gradient-boosting-autocontext', 'featureNames': fnames,
               'contextFeatures': ['p', 'p_n3', 'p_n7', 'p_n15', 'p_max7'],
               'stage1': trees_of(s1), 'stage2': trees_of(s2),
               'threshold': threshold, 'smooth': True, 'info': info}, open(path, 'w'), separators=(',', ':'))

os.makedirs(out, exist_ok=True)
name_idx = {n: i for i, n in enumerate(names)}
def split_images(f):
    ids = [name_idx.get(os.path.basename(l.strip())) for l in open(os.path.join(db, f)) if l.strip()]
    return set(i for i in ids if i is not None)

report = {}
for s in (1, 2, 3):
    tr_imgs = split_images('train_split%d.txt' % s)
    train_idx = np.where(np.isin(img, list(tr_imgs)))[0]
    s1, s2, X2 = fit_two_stage(train_idx)
    t, cv = choose_threshold(train_idx, X2)
    export(s1, s2, t, os.path.join(out, 'weed_gbt_split%d.json' % s), {'trainedOn': 'CoFly-WeedDB train_split%d' % s, 'trainImages': len(tr_imgs)})
    report['split%d' % s] = {'train_images': len(tr_imgs), 'threshold': round(t, 3), 'cv_weed_iou_on_train': round(cv, 3)}
    print('split', s, report['split%d' % s], flush=True)

all_idx = np.arange(len(img))
s1, s2, X2 = fit_two_stage(all_idx)
t, cv = choose_threshold(all_idx, X2)
export(s1, s2, t, os.path.join(out, 'weed_gbt.json'), {'trainedOn': 'CoFly-WeedDB, all %d labelled photos (CC-BY-4.0)' % len(names),
                                                  'dataset': 'https://doi.org/10.5281/zenodo.6697343', 'cvWeedIoU': round(cv, 3)})
m = s1
report['final'] = {'images': len(names), 'threshold': round(t, 3), 'cv_weed_iou': round(cv, 3)}
# check: the JSON export reproduces scikit-learn's probabilities
sample = X[:2000]
raw = np.full(len(sample), float(np.ravel(m._baseline_prediction)[0]))
for it in m._predictors:
    n = it[0].nodes
    for r in range(len(sample)):
        k = 0
        while not n['is_leaf'][k]:
            k = n['left'][k] if sample[r, n['feature_idx'][k]] <= n['num_threshold'][k] else n['right'][k]
        raw[r] += n['value'][k]
diff = np.abs(1 / (1 + np.exp(-raw)) - m.predict_proba(sample)[:, 1]).max()
report['export_max_abs_diff'] = float(diff)
print(json.dumps(report, indent=1))
json.dump(report, open(os.path.join(out, 'training_report.json'), 'w'), indent=1)
