// "Fly to one spot" panel (what3words) for the fly page and the project page.
// Resolves a what3words address, draws its 3 m square, and builds a Potensic Atom 2 photo mission.
// Android: pushes the mission into an existing Potensic Eve mission over adb.
// iPhone: shows the values to enter by hand in Eve (iOS apps' files cannot be written from outside).

jQuery(document).ready(function() {
    const path = require('path');
    const fs = require('fs');
    const drones = require(path.join(__dirname, 'js/drones'));
    const atom2 = drones.atom2;
    const adb = drones.createAdb();

    const notify = (title, message, type) => (window.coflyToast
        ? window.coflyToast({ title: title, message: message, type: type || 'info', duration: 6000 })
        : console.log(title + ': ' + message));

    // what3words settings live inside the panel so they work on fly.html and in projects
    jQuery('#w3w_api_key').val(localStorage.getItem('W3W_API_KEY') || '');
    jQuery('#w3w_mock').prop('checked', localStorage.getItem('W3W_MOCK') === '1');
    jQuery('#w3w_api_key').on('change', function() { localStorage.setItem('W3W_API_KEY', jQuery(this).val().trim()); });
    jQuery('#w3w_mock').on('change', function() { localStorage.setItem('W3W_MOCK', jQuery(this).is(':checked') ? '1' : '0'); });

    let current = null;      // { location, mission, card }
    let layers = [];

    const w3wLib = drones.w3w;
    const testMode = () => w3wLib.useTestMode(localStorage.getItem('W3W_API_KEY') || '', localStorage.getItem('W3W_MOCK') === '1');

    function status(html, isError) {
        jQuery('#w3w_status').toggleClass('error', !!isError).html(html);
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Missions are saved inside the open project, or in w3w_missions/ on the standalone fly page.
    function projectDir() {
        if (window.coflyW3WOutputDir) return window.coflyW3WOutputDir;
        return path.join(__dirname, 'projects', (localStorage.getItem('LoadProject') || 'default').replace(' ', ''));
    }

    function saveMission(mission, missionId) {
        const serialized = atom2.serialize(mission, missionId);
        const dir = path.join(projectDir(), 'missions', 'atom2', serialized.missionId);
        fs.mkdirSync(dir, { recursive: true });
        Object.entries(serialized.files).forEach(([name, content]) => fs.writeFileSync(path.join(dir, name), content));
        return { serialized, dir };
    }

    function drawSquare(location) {
        const map = window.coflyMap;
        if (!map) return;
        layers.forEach(l => map.removeLayer(l));
        const sw = location.square.southwest, ne = location.square.northeast;
        layers = [
            L.rectangle([[sw.lat, sw.lng], [ne.lat, ne.lng]], { color: '#e11f26', weight: 2, fillOpacity: 0.25 }).addTo(map),
            L.marker([location.lat, location.lng]).addTo(map).bindPopup('///' + escapeHtml(location.words))
        ];
        map.setView([location.lat, location.lng], 19);
    }

    function renderCard(card) {
        return '<div class="w3w_words">' + escapeHtml(card.title) + '</div>' +
            (card.nearestPlace ? '<div class="w3w_near">near ' + escapeHtml(card.nearestPlace) + '</div>' : '') +
            '<table class="w3w_table">' +
            '<tr><td>Latitude</td><td>' + card.lat + '</td></tr>' +
            '<tr><td>Longitude</td><td>' + card.lng + '</td></tr>' +
            '<tr><td>Height</td><td>' + card.height + ' m</td></tr>' +
            '<tr><td>Gimbal</td><td>' + card.gimbalPitch + '°</td></tr>' +
            '<tr><td>Action</td><td>Photo after ' + card.hoverTime + ' s hover</td></tr></table>' +
            '<details><summary>iPhone: enter by hand in Eve</summary><ol>' +
            card.steps.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ol></details>';
    }

    jQuery('#w3w_find').click(async function() {
        const words = jQuery('#w3w_words').val();
        status('Looking up ' + escapeHtml(words) + '…');
        try {
            const plan = await drones.planW3WPhoto(words, {
                apiKey: localStorage.getItem('W3W_API_KEY') || undefined,
                mock: testMode(),
                height: jQuery('#w3w_height').val(),
                gimbalPitch: jQuery('#w3w_pitch').val()
            });
            current = plan;
            drawSquare(plan.location);
            jQuery('#w3w_result').html(renderCard(plan.card)).show();
            if (plan.errors.length) {
                jQuery('#w3w_atom2_actions').hide();
                status('Not safe to fly:<br>' + plan.errors.map(escapeHtml).join('<br>'), true);
            } else {
                jQuery('#w3w_atom2_actions').show();
                status('Square found. Save the mission, or send it to the Atom 2.');
            }
        } catch (e) {
            current = null;
            jQuery('#w3w_result, #w3w_atom2_actions').hide();
            status(escapeHtml(e.message), true);
        }
    });

    jQuery('#w3w_words').on('keydown', function(e) {
        if (e.key === 'Enter') jQuery('#w3w_find').click();
    });

    jQuery('#w3w_refresh_missions').click(async function() {
        status('Looking for an Android phone…');
        try {
            await adb.checkAdb();
            const missions = await adb.listMissions();
            const sel = jQuery('#w3w_eve_mission').empty();
            if (!missions.length) {
                sel.append('<option value="">No missions in Eve yet</option>');
                status('Create any 1-point waypoint mission in Potensic Eve first, then refresh.', true);
                return;
            }
            missions.forEach(m => sel.append('<option value="' + m.id + '">' + m.id + ' (' + m.created.slice(0, 16).replace('T', ' ') + ')</option>'));
            status(missions.length + ' Eve mission(s) found. The selected one will be overwritten.');
        } catch (e) {
            status(escapeHtml(e.message), true);
        }
    });

    jQuery('#w3w_save').click(function() {
        if (!current) return;
        const res = saveMission(current.mission);
        fs.writeFileSync(path.join(res.dir, 'enter-in-eve.json'), JSON.stringify(current.card, null, 2));
        status('Saved to ' + escapeHtml(res.dir));
        notify('Mission saved', res.dir, 'success');
    });

    jQuery('#w3w_push').click(async function() {
        if (!current) return;
        const target = jQuery('#w3w_eve_mission').val();
        if (!target) return status('Pick an Eve mission to overwrite (press Refresh phone missions).', true);
        try {
            await adb.checkAdb();
            const { serialized } = saveMission(current.mission, target);
            await adb.pushMission(target, serialized);
            status('Sent! On the phone: open Potensic Eve → Waypoints → mission ' + target +
                ', check the point sits on ///' + escapeHtml(current.location.words) + ', then tap Start. Keep the drone in sight.');
            notify('Sent to Atom 2', 'Open the mission in Potensic Eve and tap Start.', 'success');
        } catch (e) {
            status(escapeHtml(e.message), true);
        }
    });


    // ---------- after the flight: analyse the single photo ----------
    let analysisLayer = null;
    const distanceM = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));
    const formatDistance = m => (m >= 1000 ? (m / 1000).toFixed(m >= 100000 ? 0 : 1) + ' km' : Math.round(m) + ' m');
    jQuery('#w3w_analyze').click(async function() {
        const $b = jQuery(this);
        if ($b.hasClass('busy')) return;
        const file = await require('electron').ipcRenderer.invoke('cofly:choose-file', 'Choose the photo the Atom 2 took');
        if (!file) return;
        $b.addClass('busy');
        status('Analysing ' + escapeHtml(path.basename(file)) + '…');
        try {
            const outDir = path.join(projectDir(), 'w3w_photos', String(Date.now()));
            const loc = current && current.location;
            const r = await drones.analyzeSinglePhoto(file, outDir, {
                height: Number(jQuery('#w3w_height').val()) || 30, lat: loc ? loc.lat : null, lng: loc ? loc.lng : null
            });
            const url = f => 'file://' + encodeURI(path.join(outDir, f).replace(/\\/g, '/'));
            const h = r.health.GLI;
            jQuery('#w3w_analysis').html(
                '<b>' + escapeHtml(r.image) + '</b>' + (current ? ' at ///' + escapeHtml(current.location.words) : '') +
                '<div class="w3w_thumbs">' +
                '<figure><img src="' + url(r.image) + '"><figcaption>photo</figcaption></figure>' +
                '<figure><img src="' + url(r.files.GLI) + '"><figcaption>crop health (GLI)</figcaption></figure>' +
                '<figure><img src="' + url(r.files.weedsPhoto) + '"><figcaption>weeds (purple)</figcaption></figure></div>' +
                'Crop health: average GLI <b>' + (h.mean != null ? h.mean.toFixed(2) : '–') + '</b>, problem patches <b>' + (h.problemFraction * 100).toFixed(1) + '%</b> of the photo<br>' +
                'Weeds: likely weed clusters cover <b>' + (r.weeds.cover * 100).toFixed(1) + '%</b> of the photo' +
                (r.weeds.tooHigh ? '<br><span class="warn">Photo detail is ' + r.weeds.gsdCm + ' cm per pixel; weeds are only reliable at about 2 cm or less. Fly lower.</span>' : '') +
                (loc && r.tile.lat != null && distanceM(loc, r.tile) > 50 ? '<br><span class="warn">This photo\'s GPS is ' + formatDistance(distanceM(loc, r.tile)) +
                    ' from ///' + escapeHtml(loc.words) + ', so it was not taken at this square. It is shown where it was taken.</span>' : '')
            ).show();
            if (analysisLayer) window.coflyMap.removeLayer(analysisLayer);
            if (r.tile.lat != null && window.coflyMap) {
                const dLat = r.tile.heightM / 2 / 111320, dLng = r.tile.widthM / 2 / (111320 * Math.cos(r.tile.lat * Math.PI / 180));
                const b = [[r.tile.lat - dLat, r.tile.lng - dLng], [r.tile.lat + dLat, r.tile.lng + dLng]];
                analysisLayer = L.layerGroup([L.imageOverlay(url(r.image), b), L.imageOverlay(url(r.files.weeds), b)]).addTo(window.coflyMap);
                window.coflyMap.fitBounds(b, { maxZoom: 20 });
            }
            status('Photo analysed. Results saved in ' + escapeHtml(outDir));
        } catch (e) {
            status(escapeHtml(e.message), true);
        } finally {
            $b.removeClass('busy');
        }
    });
    jQuery(document).on('click', '.w3w_thumbs img', function() {
        const box = jQuery('<div class="wf_lightbox"><div class="wf_lb_inner"><img><span class="wf_lb_close">×</span></div></div>');
        box.find('img').attr('src', this.src).css({ maxWidth: '90vw' });
        box.appendTo('body').on('click', () => box.remove());
    });
});
