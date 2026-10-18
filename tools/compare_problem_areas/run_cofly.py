# Run CoFly's own find_areas() / find_Lat_Lon() (verbatim from areas_detection.py) on each case.
import sys, types, json, os, traceback
import numpy as np

src_file, case_dir = sys.argv[1], sys.argv[2]
src = open(src_file).read()
src = src.split('# -- Read the given arguments -- #')[0]          # functions only, no CLI part

# osgeo is only used for GeoTIFF I/O; a tiny stand-in provides the WGS84 transform for find_Lat_Lon.
osgeo = types.ModuleType('osgeo')
class _T:  # identity transform: projected coords are already lon/lat; TransformPoint(x, y) -> (x, y, 0)
    def TransformPoint(self, x, y): return (x, y, 0)
class _SR:
    def ImportFromWkt(self, w): pass
    def ImportFromProj4(self, p): pass
osgeo.gdal = types.SimpleNamespace()
osgeo.osr = types.SimpleNamespace(SpatialReference=_SR, CoordinateTransformation=lambda a, b: _T())
sys.modules['osgeo'] = osgeo

meta = json.load(open(os.path.join(case_dir, 'cases.json')))
results = {}
for name in meta:
    g = {'__name__': 'cofly', 'save_dir': case_dir, 'index_name': 'cofly_' + name}
    exec(src, g)
    arr = np.load(os.path.join(case_dir, name + '.npy'))
    try:
        centers = g['find_areas'](arr)                       # (row, col) pairs
        pts = [[float(c[1]), float(c[0])] for c in centers]   # -> (x, y)
        # georeferencing check with a north-up geotransform: lon = 22 + x*1e-6, lat = 40 - y*1e-6
        class R:
            def GetGeoTransform(self): return (22.0, 1e-6, 0.0, 40.0, 0.0, -1e-6)
            def GetProjectionRef(self): return ''
        geo = g['find_Lat_Lon'](R(), centers)                 # their output: rows of [?, ?] after fliplr
        results[name] = {'points': pts, 'geo': geo.tolist()}
    except Exception as e:
        results[name] = {'error': type(e).__name__ + ': ' + str(e).splitlines()[0][:160]}
print(json.dumps(results))
