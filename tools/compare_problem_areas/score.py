# Problem-area comparison: CoFly's original Python vs this app's JS.
#   python make_cases.py cases
#   python run_cofly.py <path to CoFly areas_detection.py> cases > cofly.json   (needs numpy, scipy<1.17, scikit-image, scikit-learn, opencv, matplotlib)
#   node run_ours.js <repo root> cases > ours.json
#   python score.py cases/cases.json cofly.json ours.json
# Score both detectors: a true patch is "found" if a point lies within 1.5 m (30 px) of its centre;
# points farther than that from every true patch are false alarms. Also checks georeferencing.
import json, sys, math
meta = json.load(open(sys.argv[1])); cofly = json.loads(open(sys.argv[2]).read()); ours = json.loads(open(sys.argv[3]).read())
R = 30
def score(name, res):
    truth = meta[name]['truth']
    if 'error' in res: return 'CRASH (' + res['error'][:70] + ')', None
    pts = res['points']
    found = sum(1 for t in truth if any(math.dist(t, p) <= R for p in pts))
    false = sum(1 for p in pts if not any(math.dist(t, p) <= R for t in truth))
    err = [min(math.dist(t, p) for p in pts) * 0.05 for t in truth if pts]
    # geo check: expected lat = 40 - (y+0.5)*1e-6, lon = 22 + (x+0.5)*1e-6 ; returned rows are [lat, lon]
    geo_err = None
    if res.get('geo') and pts:
        ge = []
        for (x, y), g in zip(pts, res['geo']):
            lat, lon = 40 - (y + 0.5) * 1e-6, 22 + (x + 0.5) * 1e-6
            ge.append(math.hypot((g[0] - lat) * 111320, (g[1] - lon) * 111320 * math.cos(math.radians(40))))
        geo_err = max(ge)
    s = '%d/%d found, %d false alarm%s' % (found, len(truth), false, '' if false == 1 else 's')
    if err: s += ', centre error ≤ %.2f m' % max(err)
    return s, geo_err
print('| Test case | CoFly (original Python) | Ours (JS) |'); print('|---|---|---|')
geo = {}
for name in meta:
    c, cg = score(name, cofly[name]); o, og = score(name, ours[name])
    print('| %s | %s | %s |' % (name.replace('_', ' '), c, o))
    if cg is not None: geo.setdefault('cofly', []).append(cg)
    if og is not None: geo.setdefault('ours', []).append(og)
print()
for k, v in geo.items(): print('max georeferencing error, %s: %.1f m' % (k, max(v)))
