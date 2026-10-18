// Satellite basemap shared by every map page.
// The original CoFly Mapbox token (2021) is no longer accepted, which left every map blank,
// so CoFly now uses Esri World Imagery, which needs no key.
//
// Esri's deepest zoom level differs by place (e.g. 20 in Cambridge, MA but 18 in rural Greece) and
// missing levels return a "Map data not yet available" picture. The layer asks Esri's tile map which
// levels exist around the map centre and enlarges the deepest real level instead.
window.coflySatelliteLayer = function() {
    const base = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
    const layer = L.tileLayer(base + '/tile/{z}/{y}/{x}', {
        maxZoom: 22,
        maxNativeZoom: 19,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
    });
    const cache = {};
    function tileXY(lat, lng, z) {
        const n = Math.pow(2, z), r = lat * Math.PI / 180;
        return { x: Math.floor((lng + 180) / 360 * n), y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) };
    }
    async function available(lat, lng, z) {
        const t = tileXY(lat, lng, z), key = z + '/' + t.y + '/' + t.x;
        if (!(key in cache)) {
            cache[key] = fetch(base + '/tilemap/' + key + '/1/1').then(r => r.json()).then(d => !!(d.data && d.data[0])).catch(() => true);
        }
        return cache[key];
    }
    async function check() {
        const map = layer._map;
        if (!map || map.getZoom() < 17) return;
        const c = map.getCenter();
        let native = 16;
        for (const z of [20, 19, 18, 17]) {
            if (await available(c.lat, c.lng, z)) { native = z; break; }
        }
        if (layer.options.maxNativeZoom !== native) {
            layer.options.maxNativeZoom = native;
            layer.redraw();
        }
    }
    layer.on('add', function() {
        layer._map.on('moveend', check);
        check();
    });
    return layer;
};
