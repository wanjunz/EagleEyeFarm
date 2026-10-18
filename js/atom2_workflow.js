// Potensic Atom 2 field workflow panel on the project page (load_project.html).
// Buttons call js/analysis/pipeline.js; results are drawn on the project map (window.coflyMap).

jQuery(document).ready(function() {
    const path = require('path');
    const fs = require('fs');
    const { ipcRenderer } = require('electron');
    const pipeline = require(path.join(__dirname, 'js/analysis/pipeline'));
    const { INDEX_INFO } = require(path.join(__dirname, 'js/analysis/indices'));
    const atom2 = require(path.join(__dirname, 'js/drones/potensic_atom2'));
    const adb = require(path.join(__dirname, 'js/drones/adb_transfer')).createAdb();

    const projectName = (localStorage.getItem('LoadProject') || '').replace(' ', '');
    const projectDir = path.join(__dirname, 'projects', projectName);
    const map = () => window.coflyMap;
    const notify = (title, message, type) => window.coflyToast && window.coflyToast({ title, message, type: type || 'info', duration: 6000 });

    const layers = {};
    function layer(name) {
        if (!layers[name]) layers[name] = L.layerGroup().addTo(map());
        return layers[name];
    }
    function clear(name) { if (layers[name]) layers[name].clearLayers(); }

    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fileUrl = f => 'file://' + encodeURI(f.replace(/\\/g, '/')) + '?t=' + Date.now();
    const out = (id, html, isError) => jQuery('#' + id).toggleClass('error', !!isError).html(html);

    // Run a step: disable the button, show progress text, report errors in the step's output line.
    async function step(btn, outId, busyText, fn) {
        const $b = jQuery(btn);
        if ($b.hasClass('busy')) return;
        $b.addClass('busy');
        out(outId, '<span class="wf_spin"></span> ' + busyText);
        try {
            await fn();
            refreshSteps(false);
        } catch (e) {
            console.error(e);
            out(outId, esc(e.message), true);
        } finally {
            $b.removeClass('busy');
        }
    }

    function sliderNumber(id, fallback) {
        const v = parseFloat(String(jQuery('#' + id).val() || '').replace(/[^\d.\-]/g, ''));
        return Number.isFinite(v) ? v : fallback;
    }
    function settings() {
        return {
            height: Math.min(120, Math.max(5, sliderNumber('altitude_show', 30))),
            angle: sliderNumber('direction_show', 0),
            spacing: sliderNumber('scanning_distance_now', 0) || undefined,
            speed: Math.min(15, Math.max(1, sliderNumber('drone_speed', 5)))
        };
    }

    // ---------- drawing ----------

    function drawPlan(plan, missions) {
        clear('plan');
        if (!plan) return;
        const pts = plan.waypoints.map(w => [w.lat, w.lng]);
        L.polyline(pts, { color: '#ffffff', weight: 2, opacity: 0.85 }).addTo(layer('plan'));
        pts.forEach(p => L.circleMarker(p, { radius: 2.5, color: '#fec840', weight: 1, fillOpacity: 1 }).addTo(layer('plan')));
        jQuery('#minutes_calc').text('≈ ' + Math.max(1, Math.round(plan.minutes)) + ' min');
        jQuery('#acres_num').text((plan.areaM2 / 10000).toFixed(2) + ' ha · ' + (plan.areaM2 / 4046.86).toFixed(1) + ' ac');
        const parts = missions || pipeline.readJSON(path.join(projectDir, 'atom2', 'scan_missions.json'), []);
        jQuery('#wf_part').empty().append(parts.map((m, i) =>
            '<option value="' + i + '">Part ' + (i + 1) + ' of ' + parts.length + ' (' + m.waypoints.length + ' photos)</option>'));
        out('wf_plan_out', '<b>' + plan.waypoints.length + '</b> photo points on <b>' + plan.lines + '</b> lines · ' +
            plan.lineSpacing.toFixed(0) + ' m apart · ~' + plan.minutes.toFixed(0) + ' min · ' + parts.length + ' Eve mission' + (parts.length > 1 ? 's' : '') +
            (plan.minutes > 25 ? '<br><span class="warn">Longer than one Atom 2 battery (~30 min): fly the parts on separate batteries.</span>' : ''));
    }

    function drawPhotos(scanId) {
        clear('photos');
        const list = pipeline.readJSON(path.join(projectDir, 'scans', scanId, 'images', 'photos.json'), []);
        list.filter(p => p.lat != null).forEach(p => {
            L.circleMarker([p.lat, p.lng], { radius: 3, color: '#4fc3f7', weight: 1, fillOpacity: 0.9 })
                .bindPopup('<img src="' + fileUrl(path.join(projectDir, 'scans', scanId, 'images', p.file)) + '" style="width:220px"><br>' + esc(p.file))
                .addTo(layer('photos'));
        });
    }

    const toLL = b => [[b.south, b.west], [b.north, b.east]];

    // Stitched field maps from step 4: 'photos', an index name (crop health) or 'weeds'
    let currentLayer = 'photos', currentIndex = 'GLI';
    function drawAnalysis(scanId, which) {
        clear('fieldmap'); clear('problems'); clear('weedpatches');
        const a = pipeline.readJSON(path.join(projectDir, 'scans', scanId, 'analysis', 'analysis.json'), null);
        if (!a) { jQuery('#wf_layer_pick').empty(); jQuery('#wf_legend').hide(); out('wf_health_out', ''); return null; }
        currentLayer = which || currentLayer;
        if (INDEX_INFO[currentLayer]) currentIndex = currentLayer;
        const base = path.join(projectDir, 'scans', scanId, 'analysis');
        const bounds = toLL(a.bounds);
        const show = currentLayer === '__hide' ? null : currentLayer;
        if (show === 'photos' || show === 'weeds') {
            L.imageOverlay(fileUrl(path.join(base, a.layers.photos)), bounds).addTo(layer('fieldmap'));
        }
        if (show === 'weeds') L.imageOverlay(fileUrl(path.join(base, a.layers.weeds)), bounds).addTo(layer('fieldmap'));
        if (show && INDEX_INFO[show]) {
            L.imageOverlay(fileUrl(path.join(base, a.layers[show])), bounds, { opacity: 0.9 }).addTo(layer('fieldmap'));
            a.problems[show].forEach((p, i) => L.marker([p.lat, p.lng], { icon: problemIcon(i + 1), title: 'Problem area ' + (i + 1) })
                .bindPopup('<b>Problem area ' + (i + 1) + '</b><br>Low ' + show + ' (stressed or bare)<br>' + p.lat.toFixed(6) + ', ' + p.lng.toFixed(6))
                .addTo(layer('problems')));
        }
        const chip = (key, label, title) => '<span class="wf_idx' + (key === currentLayer ? ' on' : '') + '" data-layer="' + key + '" title="' + esc(title) + '">' + label + '</span>';
        jQuery('#wf_layer_pick').html(chip('photos', 'PHOTOS', 'Stitched photos of the field') +
            ['GLI', 'VARI', 'NGRDI', 'NGBDI'].filter(n => a.health[n]).map(n => chip(n, n, INDEX_INFO[n])).join('') +
            chip('weeds', 'WEEDS', 'Likely weed clusters (purple)') + '<span class="wf_idx off" data-layer="__hide" title="Show the satellite map only">HIDE</span>');
        jQuery('#wf_legend').toggle(!!(show && INDEX_INFO[show]));
        const w = a.weeds;
        let text;
        if (show && INDEX_INFO[show]) {
            text = esc(INDEX_INFO[show]) + '<br>Problem patches cover <b>' + (a.health[show].problemFraction * 100).toFixed(1) + '%</b> of the field · <b>' +
                a.problems[show].length + '</b> problem area' + (a.problems[show].length === 1 ? '' : 's') + ' marked';
        } else if (show === 'weeds') {
            text = 'Likely weed clusters cover <b>' + (w.cover * 100).toFixed(1) + '%</b> of the field (purple).';
        } else {
            text = a.stitch === 'sfm' ? a.photoCount + ' photos joined into one seamless map by 3D matching (structure from motion).'
                : a.photoCount + ' photos stitched by GPS position.';
        }
        if (a.stitch === 'sfm' && w.tooHigh) text += '<br><span class="warn">The stitched map is ' + w.gsdCm + ' cm per pixel, too coarse for reliable weed detection (aim for 2 cm or less: fly lower).</span>';
        else if (w.tooHighPhotos) text += '<br><span class="warn">' + w.tooHighPhotos + ' photo(s) were taken too high for reliable weed detection (' +
            w.gsdCm + ' cm per pixel; aim for 2 cm or less: fly lower).</span>';
        out('wf_health_out', text);
        return a;
    }

    // ---------- field health summary (step 6) ----------
    let summarizing = false;
    function drawSummary(id) {
        clear('attention');
        const a = id && pipeline.readJSON(path.join(projectDir, 'scans', id, 'analysis', 'analysis.json'), null);
        if (!a) { updateHeadline(null); jQuery('#wf_scores').html('<p class="cf-hint">Analyse the photos first (step 4).</p>'); return; }
        const f = a.fieldSummary;
        if (!f) {
            // older analyses: work out the summary now (about 0.2 s per photo) and save it
            if (summarizing) return;
            summarizing = true;
            jQuery('#wf_scores').html('<p class="cf-hint"><span class="wf_spin"></span> Working out the field summary…</p>');
            pipeline.summarizeScan(projectDir, id, {
                onProgress: (i, n) => { if (i % 10 === 0 || i === n) jQuery('#wf_scores .cf-hint').html('<span class="wf_spin"></span> Working out the field summary: photo ' + i + ' of ' + n); }
            }).then(() => { summarizing = false; drawSummary(id); refreshSteps(false); })
              .catch(e => { summarizing = false; jQuery('#wf_scores').html('<p class="error">' + esc(e.message) + '</p>'); });
            return;
        }
        const h = f.cropHealth, w = f.weeds;
        updateHeadline(f);
        const tone = r => ({ Good: 'good', Low: 'good', Fair: 'fair', Moderate: 'fair', Poor: 'poor', High: 'poor' }[r]);
        const parts = [h.thinPct && h.thinPct + '% thin crop', h.palePct && h.palePct + '% pale crop', h.patchyPct && h.patchyPct + '% bare or stressed patches'].filter(Boolean);
        jQuery('#wf_scores').html(
            '<div class="wf_score ' + tone(h.rating) + '"><div class="wf_score_k">Crop health</div>' +
            (h.score == null
                ? '<div class="wf_score_v">–</div><span class="wf_pill">' + esc(h.rating) + '</span><p>' + esc(h.reason) + '</p></div>'
                : '<div class="wf_score_v">' + h.score + '<small>/100</small></div><span class="wf_pill">' + h.rating + '</span>' +
                  '<p>' + (100 - h.attentionPct).toFixed(0) + '% of the field looks healthy.' + (parts.length ? ' Needs a look: ' + parts.join(', ') + '.' : '') + '</p></div>') +
            '<div class="wf_score ' + tone(w.rating) + '"><div class="wf_score_k">Weeds</div>' +
            '<div class="wf_score_v">' + w.pct + '<small>%</small></div><span class="wf_pill">' + w.rating + '</span>' +
            '<p>of the photographed field has likely weed patches.</p></div>' +
            '<p class="cf-hint wf_score_note">Based on ' + f.context.photos + ' photos (' + f.context.areas + ' areas of about 4 m). Typical green cover ' + f.context.typicalCoverPct + '%.</p>');
    }

    // headline cards at the top of the sidebar
    function updateHeadline(f) {
        const set = (sel, v, r, tone) => {
            jQuery(sel).removeClass('good fair poor').addClass(tone || '');
            jQuery(sel + ' .v').html(v); jQuery(sel + ' .r').text(r);
        };
        if (!f) { set('#hdr_health', '–', 'after analysis'); set('#hdr_weeds', '–', 'after analysis'); return; }
        const tone = r => ({ Good: 'good', Low: 'good', Fair: 'fair', Moderate: 'fair', Poor: 'poor', High: 'poor' }[r]);
        set('#hdr_health', f.cropHealth.score == null ? '–' : f.cropHealth.score + '<small>/100</small>', f.cropHealth.rating, tone(f.cropHealth.rating));
        set('#hdr_weeds', f.weeds.pct + '<small>%</small>', f.weeds.rating, tone(f.weeds.rating));
    }
    jQuery('.cf-headline').click(function() {
        jQuery('#atom2_workflow .wf_step').removeClass('open').filter('[data-step="6"]').addClass('open');
        document.querySelector('.wf_step[data-step="6"]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    function drawAttention(id) {
        clear('attention');
        const a = pipeline.readJSON(path.join(projectDir, 'scans', id, 'analysis', 'analysis.json'), null);
        if (!a || !a.fieldSummary) return 0;
        a.fieldSummary.attentionAreas.forEach(z => L.polygon(z.corners, { color: '#E07B00', weight: 2, fillColor: '#FFB547', fillOpacity: 0.35 })
            .bindPopup('<b>Needs a look</b><br>' + z.why.join(', ')).addTo(layer('attention')));
        return a.fieldSummary.attentionAreas.length;
    }

    jQuery('#wf_show_attention').click(function() {
        const id = scanId();
        if (!id) return;
        drawAnalysis(id, 'photos');
        const n = drawAttention(id);
        out('wf_summary_out', n ? 'Orange squares mark the ' + n + ' areas that need a look. Click one to see why.' : 'No areas need a look.');
    });
    jQuery('#wf_show_weeds').click(function() {
        const id = scanId();
        if (!id) return;
        clear('attention');
        drawAnalysis(id, 'weeds');
        out('wf_summary_out', 'Purple shows likely weed patches.');
    });

    function problemIcon(n) {
        return L.divIcon({ className: 'wf_problem_icon', html: '<span>' + n + '</span>', iconSize: [24, 24], iconAnchor: [12, 12] });
    }

    function drawHotpoints() {
        clear('hot');
        const hot = pipeline.readJSON(path.join(projectDir, 'atom2', 'hotpoint_plan.json'), null);
        if (!hot) return null;
        L.polyline(hot.points.map(p => [p.lat, p.lng]), { color: '#e11f26', weight: 2, dashArray: '6 6' }).addTo(layer('hot'));
        out('wf_hot_out', '<b>' + hot.points.length + '</b> close-up photo' + (hot.points.length === 1 ? '' : 's') + ' at ' + hot.height + ' m (' + hot.index + ' problem areas)');
        return hot;
    }

    function drawWeeds() {
        clear('weeds');
        const runs = pipeline.listCloseups(projectDir);
        if (!runs.length) { jQuery('#wf_weed_list').empty(); return; }
        const run = runs[0];
        const base = path.join(projectDir, 'closeups', run.id);
        const items = run.results.map((r, i) => {
            const pct = (r.weedCover * 100).toFixed(1) + '% weeds';
            const level = r.weedCover > 0.05 ? 'high' : r.weedCover > 0.01 ? 'mid' : 'low';
            if (r.lat != null) {
                L.circleMarker([r.lat, r.lng], { radius: 8, color: '#fff', weight: 2, fillColor: { high: '#9b1fa0', mid: '#e8a33c', low: '#2e9b4f', unknown: '#888' }[level], fillOpacity: 0.95 })
                    .bindPopup('<img src="' + fileUrl(path.join(base, r.overlay)) + '" style="width:240px"><br><b>' + esc(r.photo) + '</b>: ' + pct)
                    .addTo(layer('weeds'));
            }
            return '<div class="wf_weed ' + level + '" data-i="' + i + '"><img src="' + fileUrl(path.join(base, r.overlay)) + '"><div><b>' + esc(r.photo) + '</b><br>' + pct +
                (r.tooHigh ? '<br><small class="warn">taken too high for reliable weed detection</small>' : '<br><small>' + r.gsdCm + ' cm per pixel</small>') + '</div></div>';
        });
        jQuery('#wf_weed_list').html(items.join('')).data('run', { base, results: run.results });
        out('wf_weed_out', run.photoCount + ' close-up photo' + (run.photoCount === 1 ? '' : 's') + ' checked. Purple = likely weed clusters.');
    }

    function refreshScans(selectId) {
        const scans = pipeline.listScans(projectDir);
        jQuery('#wf_scan').html(scans.map(s => '<option value="' + s.scanId + '">' + new Date(Number(s.scanId)).toLocaleString() +
            ' · ' + s.photoCount + ' photos</option>').join(''));
        jQuery('.wf_scan_pick').toggle(scans.length > 0);
        if (selectId) jQuery('#wf_scan').val(selectId);
        return scans;
    }
    const scanId = () => jQuery('#wf_scan').val();
    function requireScan() { if (!scanId()) throw new Error('Import the scan photos first (step 3).'); return scanId(); }

    function showScan(id) {
        clear('photos'); clear('ortho'); clear('fieldmap'); clear('problems'); clear('attention');
        if (!id) return;
        const a = drawAnalysis(id);
        if (!a) drawPhotos(id);   // photo positions until the stitched maps exist
        drawSummary(id);
        const meta = pipeline.listScans(projectDir).find(s => s.scanId === id);
        if (meta) out('wf_import_out', meta.photoCount + ' photos imported (' + meta.withGps + ' with GPS), taken at ' + meta.height + ' m');
        if (a) {
            out('wf_analyze_out', 'Done: ' + a.photoCount + ' photos ' + (a.stitch === 'sfm' ? 'joined by 3D matching' : 'placed by GPS') +
                ' and analysed. Pick a map in step 5.' + (a.stitchNote ? '<br><span class="warn">' + esc(a.stitchNote) + '</span>' : ''));
            map().fitBounds(toLL(a.bounds), { maxZoom: 20 });
        }
    }

    // ---------- step buttons ----------

    jQuery('#wf_plan').click(function() {
        step(this, 'wf_plan_out', 'Planning…', async () => {
            const res = pipeline.planScan(projectDir, settings());
            drawPlan(res.plan, res.missions);
            jQuery('#wf_photo_height').val(res.plan.height);
            map().fitBounds(L.polyline(res.plan.waypoints.map(w => [w.lat, w.lng])).getBounds(), { maxZoom: 19 });
        });
    });

    async function refreshPhone(selectIds, outId) {
        await adb.checkAdb();
        const missions = await adb.listMissions();
        const opts = missions.length
            ? missions.map(m => '<option value="' + m.id + '">' + m.id + ' (' + m.created.slice(0, 16).replace('T', ' ') + ')</option>').join('')
            : '<option value="">No missions in Eve yet</option>';
        selectIds.forEach(id => jQuery('#' + id).html(opts));
        if (!missions.length) throw new Error('Make any 1-point waypoint mission in Potensic Eve first, then refresh. It will be overwritten.');
        out(outId, missions.length + ' Eve mission(s) on the phone. The one you pick gets overwritten.');
    }

    jQuery('#wf_refresh').click(function() {
        step(this, 'wf_send_out', 'Looking for the phone…', () => refreshPhone(['wf_eve_mission', 'w3w_eve_mission'], 'wf_send_out'));
    });

    function scanMissions() {
        const missions = pipeline.readJSON(path.join(projectDir, 'atom2', 'scan_missions.json'), null);
        if (!missions) throw new Error('Plan the scan first (step 1).');
        return missions;
    }

    function saveFiles(serialized, folder) {
        const dir = path.join(projectDir, 'atom2', folder, serialized.missionId);
        fs.mkdirSync(dir, { recursive: true });
        Object.entries(serialized.files).forEach(([n, c]) => fs.writeFileSync(path.join(dir, n), c));
        return dir;
    }

    jQuery('#wf_send_scan').click(function() {
        step(this, 'wf_send_out', 'Sending to the phone…', async () => {
            const target = jQuery('#wf_eve_mission').val();
            if (!target) throw new Error('Press REFRESH PHONE and pick an Eve mission to overwrite.');
            const part = Number(jQuery('#wf_part').val() || 0);
            const ser = pipeline.serializePlanMission(scanMissions(), part, target);
            await adb.checkAdb();
            await adb.pushMission(target, ser);
            saveFiles(ser, 'sent');
            out('wf_send_out', 'Sent part ' + (part + 1) + ' to Eve mission ' + target + '. Open it in Potensic Eve, check it, tap Start.');
            notify('Scan sent to Atom 2', 'Open the mission in Potensic Eve and tap Start.', 'success');
        });
    });

    jQuery('#wf_save_scan').click(function() {
        step(this, 'wf_send_out', 'Saving…', async () => {
            const missions = scanMissions();
            const dirs = missions.map((m, i) => saveFiles(atom2.serialize(m, String(Date.now() + i)), 'missions'));
            out('wf_send_out', 'Saved ' + dirs.length + ' mission file set(s) in ' + esc(path.dirname(dirs[0])));
        });
    });

    jQuery('#wf_import_scan').click(function() {
        step(this, 'wf_import_out', 'Choose the photo folder…', async () => {
            const folder = await ipcRenderer.invoke('cofly:choose-folder', 'Choose the scan photos (SD card → DCIM)');
            if (!folder) return out('wf_import_out', '');
            out('wf_import_out', '<span class="wf_spin"></span> Importing…');
            const res = pipeline.importScan(projectDir, folder, {
                height: Number(jQuery('#wf_photo_height').val()) || undefined,
                orientation: jQuery('#wf_orientation').val()
            });
            refreshScans(res.scanId);
            showScan(res.scanId);
            out('wf_import_out', res.meta.photoCount + ' photos imported (' + res.meta.withGps + ' with GPS), taken at ' + res.meta.height + ' m.' +
                (res.meta.withGps < res.meta.photoCount ? ' Photos without GPS were matched to the planned points in order.' : '') +
                ' Next: step 4.');
        });
    });

    jQuery('#wf_scan').change(function() { showScan(scanId()); refreshSteps(false); });

    try { if (localStorage.getItem('wf_method')) jQuery('#wf_method').val(localStorage.getItem('wf_method')); } catch (e) { /* default */ }
    jQuery('#wf_analyze').click(function() {
        step(this, 'wf_analyze_out', 'Starting…', async () => {
            const id = requireScan();
            let last = 0;
            const method = jQuery('#wf_method').val() || 'auto';
            try { localStorage.setItem('wf_method', method); } catch (e) { /* not saved */ }
            const a = await pipeline.analyzeScan(projectDir, id, {
                method,
                onProgress: (stage, done, total) => {
                    if (Date.now() - last < 250 && done < total) return;
                    last = Date.now();
                    out('wf_analyze_out', '<span class="wf_spin"></span> ' + esc(stage) + (total > 1 ? ': ' + done + ' of ' + total : '…'));
                },
                // OpenDroneMap progress (first run downloads about 3 GB)
                onLog: line => {
                    if (Date.now() - last < 400) return;
                    last = Date.now();
                    out('wf_analyze_out', '<span class="wf_spin"></span> 3D matching (structure from motion), several minutes: ' + esc(line.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\[\w+\]\s*/, '').slice(0, 110)));
                }
            });
            currentLayer = 'photos';
            showScan(id);
        });
    });

    jQuery(document).on('click', '#wf_layer_pick .wf_idx', function() {
        drawAnalysis(scanId(), jQuery(this).data('layer'));
    });

    jQuery('#wf_plan_hot').click(function() {
        step(this, 'wf_hot_out', 'Planning…', async () => {
            pipeline.planHotpoints(projectDir, requireScan(), { index: currentIndex, height: jQuery('#wf_hot_height').val() });
            drawHotpoints();
        });
    });

    jQuery('#wf_send_hot').click(function() {
        step(this, 'wf_hot_out', 'Sending to the phone…', async () => {
            const mission = pipeline.readJSON(path.join(projectDir, 'atom2', 'hotpoint_mission.json'), null);
            if (!mission) throw new Error('Plan the close-up flight first.');
            const target = jQuery('#wf_eve_mission').val();
            if (!target) throw new Error('In step 2, press REFRESH PHONE and pick an Eve mission to overwrite.');
            const ser = atom2.serialize(mission, target);
            await adb.checkAdb();
            await adb.pushMission(target, ser);
            saveFiles(ser, 'sent');
            out('wf_hot_out', 'Close-up flight sent to Eve mission ' + target + '. Open it in Potensic Eve and tap Start.');
        });
    });

    jQuery('#wf_import_close').click(function() {
        step(this, 'wf_weed_out', 'Choose the close-up photo folder…', async () => {
            const folder = await ipcRenderer.invoke('cofly:choose-folder', 'Choose the Atom 2 close-up photos');
            if (!folder) return out('wf_weed_out', '');
            await pipeline.importCloseups(projectDir, folder, {
                onProgress: (i, n, name) => out('wf_weed_out', '<span class="wf_spin"></span> Checking ' + i + ' of ' + n + ': ' + esc(name))
            });
            drawWeeds();
        });
    });

    // Enlarge a weed result
    jQuery(document).on('click', '.wf_weed', function() {
        const run = jQuery('#wf_weed_list').data('run');
        const r = run.results[Number(jQuery(this).data('i'))];
        if (r.lat != null) map().setView([r.lat, r.lng], 20);
        const box = jQuery('<div class="wf_lightbox"><div class="wf_lb_inner"><img><img><p></p><span class="wf_lb_close">×</span></div></div>');
        box.find('img').eq(0).attr('src', fileUrl(path.join(run.base, r.image)));
        box.find('img').eq(1).attr('src', fileUrl(path.join(run.base, r.overlay)));
        box.find('p').text(r.photo + ' · ' + (r.weedCover * 100).toFixed(1) + '% of the photo is likely weed clusters' +
            ' · left: original, right: purple = likely weeds');
        box.appendTo('body').on('click', function(e) { if (e.target === this || jQuery(e.target).hasClass('wf_lb_close')) box.remove(); });
    });

    // ---------- step accordion with progress ----------
    function stepInfo() {
        const exists = p => fs.existsSync(path.join(projectDir, p));
        const plan = pipeline.readJSON(path.join(projectDir, 'atom2', 'scan_plan.json'), null);
        const scans = pipeline.listScans(projectDir);
        const scan = scans.find(x => x.scanId === scanId()) || scans[0];
        const a = scan && scan.analysis;
        const hot = pipeline.readJSON(path.join(projectDir, 'atom2', 'hotpoint_plan.json'), null);
        const close = pipeline.listCloseups(projectDir)[0];
        return {
            1: plan && (plan.waypoints.length + ' photos · ' + plan.minutes.toFixed(0) + ' min · ' + plan.height + ' m'),
            2: (exists('atom2/sent') && 'sent to the phone') || (exists('atom2/missions') && 'mission files saved'),
            3: scan && (scan.photoCount + ' photos imported'),
            4: a && (a.photoCount + ' photos analysed'),
            5: a && ('weeds ' + (a.weeds.cover * 100).toFixed(1) + '% · ' + a.problems.GLI.length + ' problem area' + (a.problems.GLI.length === 1 ? '' : 's')),
            6: a && a.fieldSummary && ('crop health ' + (a.fieldSummary.cropHealth.score == null ? 'no crop seen' : a.fieldSummary.cropHealth.score + '/100') + ' · weeds ' + a.fieldSummary.weeds.pct + '%'),
            7: hot && (hot.points.length + ' close-up' + (hot.points.length === 1 ? '' : 's') + ' at ' + hot.height + ' m'),
            8: close && (close.photoCount + ' close-up' + (close.photoCount === 1 ? '' : 's') + ' checked')
        };
    }

    function refreshSteps(openSuggested) {
        const info = stepInfo();
        let furthest = 0;
        for (let n = 1; n <= 8; n++) if (info[n]) furthest = n;
        const current = Math.min(8, furthest + 1);
        jQuery('#atom2_workflow .wf_step').each(function() {
            const n = Number(jQuery(this).data('step'));
            jQuery(this).toggleClass('done', !!info[n]).toggleClass('current', n === current && !info[n]);
            jQuery(this).find('.wf_summary').text(info[n] || (n === current ? 'next step' : ''));
        });
        if (openSuggested) {
            const open = info[4] ? 6 : current;   // analysed field: open the summary first
            jQuery('#atom2_workflow .wf_step').removeClass('open').filter('[data-step="' + open + '"]').addClass('open');
        }
    }

    jQuery(document).on('click', '#atom2_workflow .wf_head', function() {
        const st = jQuery(this).closest('.wf_step');
        const wasOpen = st.hasClass('open');
        jQuery('#atom2_workflow .wf_step').removeClass('open');
        if (!wasOpen) st.addClass('open');
    });

    // ---------- restore saved state ----------
    function restore() {
        if (!projectName || !map()) return;
        const plan = pipeline.readJSON(path.join(projectDir, 'atom2', 'scan_plan.json'), null);
        if (plan) drawPlan(plan);
        else {
            try {
                const area = require('@mapbox/geojson-area').geometry({ type: 'Polygon', coordinates: [pipeline.fieldRing(projectDir).map(p => [p.lng, p.lat])] });
                jQuery('#acres_num').text((area / 10000).toFixed(2) + ' ha · ' + (area / 4046.86).toFixed(1) + ' ac');
            } catch (e) { /* no outline */ }
        }
        jQuery('#wf_photo_height').val(plan ? plan.height : 30);
        const scans = refreshScans();
        if (scans.length) showScan(scans[0].scanId);
        drawHotpoints();
        drawWeeds();
        refreshSteps(true);
    }
    // load_project.js creates the map in its own ready handler; run after it.
    setTimeout(restore, 0);
});
