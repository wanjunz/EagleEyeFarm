// Create Project: the field is the four-cornered area between four what3words addresses.
// Uses globals from js/main_map.js: map, featureGroup.

jQuery(document).ready(function() {
    const path = require('path');
    const w3w = require(path.join(__dirname, 'js/w3w/what3words'));
    const geojsonArea = require('@mapbox/geojson-area');

    const keyOf = () => localStorage.getItem('W3W_API_KEY') || '';
    const testMode = () => w3w.useTestMode(keyOf(), localStorage.getItem('W3W_MOCK') === '1');
    jQuery('#w3w_api_key').val(keyOf()).on('change', function() { localStorage.setItem('W3W_API_KEY', jQuery(this).val().trim()); });
    jQuery('#w3w_mock').prop('checked', localStorage.getItem('W3W_MOCK') === '1').on('change', function() {
        localStorage.setItem('W3W_MOCK', jQuery(this).is(':checked') ? '1' : '0');
    });

    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const status = (html, err) => jQuery('#fc_status').toggleClass('error', !!err).html(html);
    const extras = L.layerGroup().addTo(map);

    // Order corners around their centre so the outline never crosses itself.
    function orderCorners(pts) {
        const c = pts.reduce((a, p) => ({ lat: a.lat + p.lat / pts.length, lng: a.lng + p.lng / pts.length }), { lat: 0, lng: 0 });
        const k = Math.cos(c.lat * Math.PI / 180);
        return pts.slice().sort((a, b) => Math.atan2(a.lat - c.lat, (a.lng - c.lng) * k) - Math.atan2(b.lat - c.lat, (b.lng - c.lng) * k));
    }

    jQuery('#fc_find').click(async function() {
        const words = [1, 2, 3, 4].map(i => jQuery('#fc_' + i).val().trim());
        if (words.some(w => !w)) return status('Enter all four corner addresses.', true);
        status('Looking up the four corners…');
        jQuery('#fc_count').text('0 of 4');
        const found = [];
        for (let i = 0; i < 4; i++) {
            try {
                found.push(await w3w.convertToCoordinates(words[i], { apiKey: keyOf() || undefined, mock: testMode() }));
            } catch (e) {
                return status('Corner ' + (i + 1) + ' (' + esc(words[i]) + '): ' + esc(e.message), true);
            }
        }
        const uniq = new Set(found.map(f => f.words));
        if (uniq.size < 4) return status('Two corners are the same square. Enter four different addresses.', true);

        const corners = orderCorners(found.map(f => ({ words: f.words, lat: f.lat, lng: f.lng, nearestPlace: f.nearestPlace })));
        const ring = corners.map(c => [c.lng, c.lat]);
        const area = geojsonArea.geometry({ type: 'Polygon', coordinates: [ring.concat([ring[0]])] });
        if (area < 100) return status('The corners are too close together (' + area.toFixed(0) + ' m²). Check the addresses.', true);

        featureGroup.clearLayers();
        extras.clearLayers();
        const poly = L.polygon(corners.map(c => [c.lat, c.lng]), { color: '#fec840', weight: 3, fillOpacity: 0.15 });
        featureGroup.addLayer(poly);
        corners.forEach((c, i) => {
            L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'fc_corner_icon', html: '<span>' + (i + 1) + '</span>', iconSize: [22, 22], iconAnchor: [11, 11] }) })
                .bindPopup('///' + esc(c.words) + (c.nearestPlace ? '<br>' + esc(c.nearestPlace) : '')).addTo(extras);
        });
        map.fitBounds(poly.getBounds(), { padding: [40, 40], maxZoom: 19 });
        const acres = area * 0.00024711;
        window.coflyFieldCorners = corners;
        jQuery('#fc_count').text('4 of 4');
        jQuery('#acres_num').text((area / 10000).toFixed(2) + ' ha · ' + acres.toFixed(1) + ' ac');
        status('Field found: <b>' + (area / 10000).toFixed(2) + ' ha</b> (' + acres.toFixed(2) + ' acres)' +
            (area > 400000 ? '<br><span class="warn">Large field: the scan will need several batteries.</span>' : '') +
            '<br>Check the outline on the map, then press <b>Create project</b>.');
    });
});
