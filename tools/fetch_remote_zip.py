# Download selected files from a large remote zip (e.g. CoFly-WeedDB on Zenodo) using HTTP range requests.
#   python tools/fetch_remote_zip.py <url> list
#   python tools/fetch_remote_zip.py https://zenodo.org/api/records/6697343/files/CoFly-WeedDB.zip/content extract data \
#       "CoFly-WeedDB/images/*" "CoFly-WeedDB/labels_1d/*" "CoFly-WeedDB/*.txt"
# Read a remote zip with HTTP range requests: list it or extract selected members, without downloading it all.
import io, sys, zipfile, urllib.request, fnmatch, os

class HttpFile(io.RawIOBase):
    def __init__(self, url):
        req = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req) as r:
            self.url = r.geturl(); self.size = int(r.headers['Content-Length'])
        self.pos = 0; self.cache = {}
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def readinto(self, b):
        n = min(len(b), self.size - self.pos)
        if n <= 0: return 0
        req = urllib.request.Request(self.url, headers={'Range': 'bytes=%d-%d' % (self.pos, self.pos + n - 1)})
        with urllib.request.urlopen(req) as r: data = r.read()
        b[:len(data)] = data; self.pos += len(data); return len(data)

url, cmd = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(io.BufferedReader(HttpFile(url), buffer_size=1 << 20))
if cmd == 'list':
    for i in z.infolist(): print(i.file_size, i.filename)
else:
    out, patterns = sys.argv[3], sys.argv[4:]
    for i in z.infolist():
        if any(fnmatch.fnmatch(i.filename, p) for p in patterns) and not i.is_dir():
            dest = os.path.join(out, i.filename); os.makedirs(os.path.dirname(dest), exist_ok=True)
            with z.open(i) as src, open(dest, 'wb') as f: f.write(src.read())
            print('extracted', i.filename)
