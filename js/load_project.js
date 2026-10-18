const {
    off
} = require('process');

jQuery(document).ready(function() {

    // Potensic Atom 2 only: it has no live link, so missions go to the Potensic Eve app and photos are
    // imported from the drone's SD card afterwards. The field workflow lives in js/atom2_workflow.js.

    // Create Drone Location Marker
    var drone_icon = L.icon({
        iconUrl: 'img/our_marker.png',
        /*shadowUrl: 'img/leaf-shadow.png',*/
        iconSize: [50, 73], // size of the icon
        shadowSize: [50, 64], // size of the shadow
        iconAnchor: [25, 70], // point of the icon which will correspond to marker's location
        shadowAnchor: [4, 62], // the same for the shadow
        popupAnchor: [0, -76] // point from which the popup should open relative to the iconAnchor
    });



    // Create Mark for photo indeces marker
    var alert_indeces = L.icon({
        iconUrl: 'img/Alert_Indeces.png',
        /*shadowUrl: 'img/leaf-shadow.png',*/
        iconSize: [50, 73], // size of the icon
        shadowSize: [50, 64], // size of the shadow
        iconAnchor: [25, 70], // point of the icon which will correspond to marker's location
        shadowAnchor: [4, 62], // the same for the shadow
        popupAnchor: [0, -76] // point from which the popup should open relative to the iconAnchor
    });



    //print_project_gallery();
    var show_slide = true;

    // check if load project exists
    var project_path = localStorage.getItem("LoadProject");
    load_project_calulated_path();
    draw_stiched_image();

    var get_center = localStorage.getItem("LoadedProjectCenter");
    var clean_center = get_center.split(",");


    L.mapbox.accessToken = 'pk.eyJ1IjoiZWdnbGV6b3NrIiwiYSI6ImNra2Z0NndyczBsYTUydm43Yjh3bDRvMHUifQ.cvUwSVInY69HPVpp1YdVIA';
    var map = L.mapbox.map('map')
        .setView([parseFloat(clean_center[1]), parseFloat(clean_center[0])], 18)
        .addLayer(coflySatelliteLayer());
    map.scrollWheelZoom.disable();
    // Shared with js/w3w_panel.js (what3words -> Potensic Atom 2 panel)
    window.coflyMap = map;
    window.coflyToast = toast;

    var featureGroup = L.featureGroup().addTo(map);



    // Drawing on this map marks no-fly zones (saved to disabled_paths.geojson): areas only.
    var drawControl = new L.Control.Draw({
        draw: {
            polyline: false, circle: false, marker: false, circlemarker: false,
            polygon: { shapeOptions: { color: '#B3261E', weight: 2, fillOpacity: 0.2 } },
            rectangle: { shapeOptions: { color: '#B3261E', weight: 2, fillOpacity: 0.2 } }
        },
        edit: {
            featureGroup: featureGroup

        }
    }).addTo(map);
    if (L.drawLocal) {
        L.drawLocal.draw.toolbar.buttons.polygon = 'Draw a no-fly zone';
        L.drawLocal.draw.toolbar.buttons.rectangle = 'Draw a rectangular no-fly zone';
    }




    // Ftiaxnw ton marker gia tis eikones pou erxontai
    var image_icon = L.icon({
        iconUrl: 'img/1pixel_transparent.png',
        /*shadowUrl: 'img/leaf-shadow.png',*/

        iconSize: [50, 73], // size of the icon
        popupAnchor: [0, 0] // point from which the popup should open relative to the iconAnchor

    });

    /* Apofugei empodiwn draw new polygons */

    console.log(disabled_paths());
    map.on('draw:created', function(e) {

        e.layer.options.className = "DisabledPathDraw";
        // Each time a feaute is created, it's added to the over arching feature group
        featureGroup.addLayer(e.layer);
        all_new_disabled_paths = featureGroup.toGeoJSON();
        var old_disabled = disabled_paths_read();
        temp_json = JSON.stringify(all_new_disabled_paths["features"]).slice(0, -1);
        if (old_disabled == "" || old_disabled == " ") {
            //alert('einai adeio');
            fs.writeFileSync('./projects/' + project_path.replace(" ", "") + '/disabled_paths.geojson', '{"type":"FeatureCollection","features":[' + temp_json.slice(1) + ']}');
        } else {
            var old_disabled = disabled_paths_read().slice(0, -2);
            console.log(old_disabled + ',' + temp_json.slice(1) + ']}');
            fs.writeFileSync('./projects/' + project_path.replace(" ", "") + '/disabled_paths.geojson', old_disabled + ',' + temp_json.slice(1) + ']}');
        }

    });



    const path = require('path');
    /* LISTEN NEW SERVICE  UPLOAD FILE TO PROJECT FILE */
    const fs = require('fs');






    // Receive data to trigger save image


    // To python script apo KETA stelnei se auto to link to ypologismeno monopati pou tha akoloutheisei to drone.


    // Calculate Path Error Return PopUp Box + Error Text from DICT






    // Calculate path button trigger

    /* Excecute The Seccond Fly  */
    // Calculate path button trigger

    /* Function that Creates The Problematic Areas file Points */


    /* function that checks in which point must keep photos */

    // Excecute RGB VLS INDECES 
    // Pattern Navigation: projects/[project_name]/rgb_vls_results/


    // Trigger Mechanism to lock the settings of the project

    jQuery('div#lock_project').click(function() {

        var plan_name = jQuery('input#plan_name').val();
        var altitude = jQuery('input#altitude_show').val().replace('m', '');
        var direction_show = jQuery('input#direction_show').val().replace('°', '');
        var scanning_distance = jQuery('input#scanning_distance_now').val().replace('m', '');
        var gimbal_pitch = jQuery('input#gimbal_pitch').val().replace('°', '');
        var drone_speed = jQuery('input#drone_speed').val().replace('m/s', '');
        var acres = jQuery('span#acres_num').text();

        var prepare_json_project = '{"CoFly": { "Plan_Name":"' + plan_name + '", "Calculated_Minutes":"' + '--:--' + '","Calculated_Acres":"' + acres + '","Altitude":"' + altitude + '","Rotation":"' + direction_show + '","Lock_Project":"1","Scanning_Distance":"' + scanning_distance + '","Gimbal_Pitch":"' + gimbal_pitch + '","Drone_Speed":"' + drone_speed + '" } }';

        fs.mkdirSync('./projects/' + plan_name, { recursive: true });
        fs.writeFileSync('projects/' + plan_name + '/proj_settings.json', prepare_json_project);
        toast({ title: 'Settings saved', message: 'Flight settings are stored in this project.', type: 'success', duration: 3000 });


    });

    // START PATH BUTTON TRIGGER

    // ABORT scanning 

    function scan_complete() {
        jQuery('div#cancel_scanning').fadeOut();
        jQuery('div#start_scanning').fadeIn();
    }


    // function in order to call loaded project settings

    function load_project_settings() {
        var fs = require('fs');
        const path = require('path');
        var running_on = path.resolve(__dirname);
        var contents = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/proj_settings.json', 'utf8');
        return contents;
    }

    // function in order to call loaded project settings

    function load_project_calulated_path() {

        var fs = require('fs');
        try {
            const path = require('path');
            var running_on = path.resolve(__dirname);
            fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/paths/calculated_path.json', 'utf8');
            var contents = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/paths/calculated_path.json', 'utf8');
            //jQuery('div#calculate_path_planing').fadeOut();
            jQuery('div#start_scanning').fadeIn();

        } catch (err) {
            return false;
        }


        //return contents;
        try {

            setTimeout(function() {
                var map_Data_load = JSON.parse(contents);
                var map_Data = JSON.parse(map_Data_load);
                var size_of_path = map_Data.DataObject.generated_path.waypoints.length;
                var pointList = [];
                for (var points = 0; points < size_of_path; points++) {
                    var tmp_point = new L.LatLng(map_Data.DataObject.generated_path.waypoints[points].lat, map_Data.DataObject.generated_path.waypoints[points].lng);
                    pointList.push(tmp_point);
                }
                var firstpolyline = new L.Polyline(pointList, {
                    color: 'white',
                    weight: 3,
                    opacity: 0.8,
                    smoothFactor: 1,
                    className: 'CalculatedPathRender'
                });
                // This is an amazing polyline in order to communicate 
                firstpolyline.addTo(map);
                jQuery('path.leaflet-clickable').first().attr('style', 'fill:transparent;');
            }, 1500);
        } catch (err) {
            console.log(err);
        }

    }



    //initialize project map and render it into map
    load_map_project();
    // initialize project timeline
    jQuery("div#timeline_div").load("scan_timeline.html");
    // render again input slider 
    function load_map_project() {
        var fs = require('fs');

        const path = require('path');
        var running_on = path.resolve(__dirname);

        var contents = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/map_data.geojson', 'utf8');
        //L.geoJson(JSON.parse(contents)).addTo(map);


        L.geoJson(JSON.parse(contents), {
            invert: true,
            worldLatLngs: [
                L.latLng([90, 360]),
                L.latLng([90, -180]),
                L.latLng([-90, -180]),
                L.latLng([-90, 360])
            ]
        }).setStyle({
            'className': '',
            // outline only: a filled field would wash out the stitched photo / crop-health / weed maps
            'fillOpacity': 0,
            'color': '#fec840',
            'weight': 2
        }).addTo(map); //.setStyle({'className': 'outline_boundaries_worldmap'}).addTo(map);



        return contents;
    }

    //initialize project map and render it into map
    //disabled_paths();
    // render disabled paths
    function disabled_paths() {
        var fs = require('fs');
        const path = require('path');
        var running_on = path.resolve(__dirname);
        var contents = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/disabled_paths.geojson', 'utf8');
        try {
            var disabledStyle = {
                "color": "red",
                "weight": 5,
                "fillColor": "red",
                "opacity": 0.65,
                "className": "DisabledPathDraw"
            };
            L.geoJson(JSON.parse(contents), {
                style: disabledStyle
            }).addTo(map);

        } catch (err) {
            console.log(err);
        }
        return contents;
    }

    // function gia na mou epistefei se json to arxeio twn disabled paths kai na mporw na to epexergastw
    function disabled_paths_read() {
        var fs = require('fs');
        const path = require('path');
        var running_on = path.resolve(__dirname);
        var contents = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/disabled_paths.geojson', 'utf8');
        return contents;
    }


    jQuery('svg.leaflet-zoom-animated g:nth-child(n+2) path').click(function() {

        console.log('Must delete svg and regerate layers delete');
        var index = jQuery("svg.leaflet-zoom-animated g:nth-child(n+2) path").index(this);
        console.log(index);
        var get_file = JSON.parse(disabled_paths_read());

        if (get_file["features"].length - 1 == 0) {
            //alert('prepei na kanw xars');
            fs.writeFileSync('./projects/' + project_path.replace(" ", "") + '/disabled_paths.geojson', ' ');
        } else {
            get_file["features"].splice(index, 1);
            console.log(JSON.stringify(get_file));
            fs.writeFileSync('./projects/' + project_path.replace(" ", "") + '/disabled_paths.geojson', JSON.stringify(get_file));
        }
        jQuery(this).remove();

    });



    // return polygon map with out render it on map 
    function load_map_project_w_o_render() {
        var fs = require('fs');
        const path = require('path');
        var running_on = path.resolve(__dirname);
        var contents = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/map_data.geojson', 'utf8');
        return contents;
    }


    // Load Project // Fill Elements
    var loaded_project = JSON.parse(load_project_settings());
    jQuery('input#plan_name').val(loaded_project.CoFly.Plan_Name);
    jQuery('span#acres_num').text(loaded_project.CoFly.Calculated_Acres);
    jQuery('span#minutes_calc').text(loaded_project.CoFly.Calculated_Minutes);
    // Flight settings (number inputs in workflow step 1). Saved values win; defaults fill gaps.
    (function fillSettings(cfg) {
        const num = (v, d, min) => { const n = parseFloat(v); return Number.isFinite(n) && n >= min ? n : d; };
        jQuery('input#altitude_show').val(num(cfg.Altitude, 20, 5));
        jQuery('input#direction_show').val(num(cfg.Rotation, 0, 0));
        jQuery('input#scanning_distance_now').val(num(cfg.Scanning_Distance, 0, 0));
        jQuery('input#drone_speed').val(num(cfg.Drone_Speed, 5, 1));
        if (!/\d/.test(String(cfg.Calculated_Acres || ''))) jQuery('span#acres_num').text('–');
        if (!/\d/.test(String(cfg.Calculated_Minutes || ''))) jQuery('span#minutes_calc').text('not planned');
    })(loaded_project.CoFly);

    jQuery('div#exit_button').click(function() {
        window.location = "./index.html";
    });

    jQuery('.button_all_ok').click(function() {

        jQuery('div#pop_up_container').fadeOut();

    });



    // Gallery Image click listener
    /*
    jQuery(document).on("click", '.nav-item div', function() {

        var get_image_path = jQuery(this).closest('li').find('img').attr('src');
        //console.log(get_image_path);
        if (jQuery('#div#lightbox').css('display') == 'none') {
            jQuery('div#lightbox').attr('style', 'background-image:url("' + get_image_path + '"); display:block;');

        } else {
            jQuery('div#lightbox').css('display', 'block');
            jQuery('div#lightbox').attr('style', 'background-image:url("' + get_image_path + '"); display:block;');

        }


    });
    */

    // Close Image Shower Action

    jQuery('.close_image_shower').click(function() {

        jQuery('div#lightbox').fadeOut();

    });

    // Close Top Bar with images from drone receiver
    jQuery('div#close_map_photo_picker i').click(function() {

        if (jQuery('div#open_image_settings_map i').hasClass('open_it')) {} else {
            jQuery('div#photo_picker_receiver_start').slideUp();
        }

    });

    // Variable in order to trigger selection mode of printed images on map
    var selection_mode = false;
    // Toogle to open menu bar for images
    jQuery('div#open_image_settings_map i').click(function() {


        if (jQuery('div#open_image_settings_map i').hasClass('open_it')) {
            jQuery(this).removeClass('open_it');
            jQuery('#photo_wizard_start').slideUp();

        } else {
            jQuery(this).addClass('open_it');
            jQuery('#photo_wizard_start').slideDown();
            // Set selectrion mode on true
            selection_mode = true;
            // Grayscale all the images in order to select which one will we move.
            jQuery('.leaflet-popup-content img').css('filter', 'grayscale(1)');

        }


    });

    function load_project_indeces_file() {
        var fs = require('fs');
        const path = require('path');
        var running_on = path.resolve(__dirname);
        var contents = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/has_indeces.json', 'utf8');
        var has_indeces = JSON.parse(contents);
        if (parseInt(has_indeces["has_indeces"]["value"]) == 0) {
            //alert('There is no photo indeces');

        } else {
            jQuery('h6.navbar-heading.project_gallery').fadeIn();
        }

        return parseInt(has_indeces["has_indeces"]["value"]);

    }


    jQuery('div#export_project').click(async function() {
        // Native folder dialog (main.js); the old hidden folder <input> stopped working in newer Electron.
        const out_dir = await require('electron').ipcRenderer.invoke('cofly:choose-export-folder');
        if (out_dir) export_project(out_dir);
    });



    /* TEST DOCKER INTEGRATION */

    // Function that calculate the photo indeces of stiched image





    jQuery(document).on('click', '.leaflet-marker-pane img', function() {
        //alert('tig marker');
        jQuery('.leaflet-marker-pane img').removeClass('selected_mark');
        jQuery(this).addClass('selected_mark');
    });

    /* 
     * Create Handler for Deleting Specific Item from List
     */
    jQuery(document).on('click', '.remove_this', function() {


        jQuery('.leaflet-popup-content').remove();

        const pathsb = require('path');
        var running_on = pathsb.resolve(__dirname);
        var path_of_json = running_on + '/projects/' + project_path.replace(" ", "") + '/' + project_path.replace(" ", "") + '/project/';


        var get_num_item = jQuery(this).attr('its_item');
        var get_file_name = jQuery(this).attr('onfile');

        if (get_file_name == "gli") {

            fs.readFile(path_of_json + '/GLI.json', (err, data) => {
                if (err) throw err;
                let student = JSON.parse(data);
                console.log(student);
                //alert('READ');
                student.splice(get_num_item, 1);
                //var save_new_data = JSON.parse(student);
                fs.writeFile(path_of_json + '/GLI.json', JSON.stringify(student), function(err, result) {
                    if (err) console.log('error', err);
                });
                console.log('GLI File Updated');
            });
        }

        if (get_file_name == "ngbdi") {

            fs.readFile(path_of_json + '/NGBDI.json', (err, data) => {
                if (err) throw err;
                let student = JSON.parse(data);
                console.log(student);
                //alert('READ');
                student.splice(get_num_item, 1);
                //var save_new_data = JSON.parse(student);
                fs.writeFile(path_of_json + '/NGBDI.json', JSON.stringify(student), function(err, result) {
                    if (err) console.log('error', err);
                });
                console.log('NGBDI File Updated');
            });
        }

        if (get_file_name == "ngrdi") {

            fs.readFile(path_of_json + '/NGRDI.json', (err, data) => {
                if (err) throw err;
                let student = JSON.parse(data);
                console.log(student);
                //alert('READ');
                student.splice(get_num_item, 1);
                //var save_new_data = JSON.parse(student);
                fs.writeFile(path_of_json + '/NGRDI.json', JSON.stringify(student), function(err, result) {
                    if (err) console.log('error', err);
                });
                console.log('NGRDI File Updated');
            });
        }

        if (get_file_name == "vari") {

            fs.readFile(path_of_json + '/VARI.json', (err, data) => {
                if (err) throw err;
                let student = JSON.parse(data);
                console.log(student);
                //alert('READ');
                student.splice(get_num_item, 1);
                //var save_new_data = JSON.parse(student);
                fs.writeFile(path_of_json + '/VARI.json', JSON.stringify(student), function(err, result) {
                    if (err) console.log('error', err);
                });
                console.log('VARI File Updated');
            });
        }




        // General Use remove marker
        jQuery('.leaflet-popup-pane div').remove();
        jQuery('.selected_mark').remove();
        jQuery('a.leaflet-popup-close-button').click();

    });


    // Function that checks if stiched image exists and than draw it on map
    function draw_stiched_image() {
        const fs = require('fs');
        const paths = require('path');
        var running_on = paths.resolve(__dirname);

        const path = running_on + '/projects/' + project_path.replace(" ", "") + '/stiched_images/stiched.png';

        fs.access(path, fs.F_OK, (err) => {
            if (err) {
                //console.error(err)
                console.log('THERE IS NO STICHED IMAGE YET');
                return
            }


            //file exists can draw
            var imageUrl = running_on + '/projects/' + project_path.replace(" ", "") + '/stiched_images/stiched.png';

            /* 
        
        Upper left corner: 40.57398606450203, 22.997528424163438
Lower right corner: 40.57197854729044, 22.99985538092048
        
        */
            var bound_boxes = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/stiched_images/edges.json', 'utf8');
            var json_bounds = JSON.parse(bound_boxes);
            cimageBounds = L.bounds([json_bounds["Lower_right_corner"], json_bounds["Upper_left_corner"]]);
            //console.log(cimageBounds.getCenter());
            imageBounds = [cimageBounds.getCenter(), json_bounds["Lower_right_corner"], json_bounds["Upper_left_corner"]];
            var stiched_options = {
                "className": "stiched_image"
            };
            L.imageOverlay(imageUrl, imageBounds, stiched_options).addTo(map);




        })
    }

    draw_photo_indices();
    // Function That Draws Photo Indices 
    function draw_photo_indices() {

        // Delete Old
        jQuery('ul.navbar-nav.mb-md-3.collapsed.project_gallery_render div').remove();

        // prepare today date in order to find the folder
        var date = new Date();
        var correct_date = date.getDate() + '-' + (date.getMonth() + 1) + '-' + date.getFullYear();

        //console.log(correct_date);

        const fs = require('fs');
        const path = require('path');
        var running_on = path.resolve(__dirname);
        if (load_project_indeces_file() != 0) {

            //console.log(running_on + '/projects/' +project_path.replace(" ", "") + '/rgb_vls_results/Resulted_Vis_image_representations/');
            fs.readdir(running_on + '/projects/' + project_path.replace(" ", "") + '/' + project_path.replace(" ", "") + '/project/', (err, files) => {



                files.forEach(file => {

                    console.log(file);
                    if (file == "GLI.png") {
                        jQuery('ul.navbar-nav.mb-md-3.collapsed.project_gallery_render').append('<div id="" class="button_full date_indeces">Open Indeces Bar</div>');
                        jQuery('ul.navbar-nav.mb-md-3.collapsed.project_gallery_render').append('<div id="remove_vls_from_map" class="button_full ">Hide from map</div>');

                    }
                    //jQuery('ul.navbar-nav.mb-md-3.collapsed.project_gallery_render').append('<div id="" class="button_full date_indeces">'+file+'</div>');
                    localStorage.setItem("last_scan_indeces", running_on + '/projects/' + project_path.replace(" ", "") + '/' + project_path.replace(" ", "") + '/');


                });

            });

        } else {
            console.log('There is no photo indeces ');
        }

    }

    /* Listener for remove rgb vls indeces from map */
    jQuery(document).on("click", "#remove_vls_from_map", function() {
        jQuery('img.calculated_rgb_vls_index').fadeOut();
        jQuery('img[title="Problem Area"]').remove();
    });



    // Event Handlet in order to click on date on indeces and draw the selected images
    jQuery(document).on('click', '.button_full.date_indeces', function() {
        //  $(this) = your current element that clicked.
        // Storing date indeces on local storage
        localStorage.setItem('date_indeces', jQuery(this).text());
        jQuery('div#photo_picker_receiver_start').slideDown();

    });


    // Draw on click the correct Index Image
    jQuery('.button_full_rgb_vls').click(function(e) {

        if (e.target.type == "checkbox") {
            return
        }
        if (jQuery('.calculated_rgb_vls_index').length > 0) {
            jQuery('.calculated_rgb_vls_index').remove();
        }

        const fs = require('fs');
        const path = require('path');
        var running_on = path.resolve(__dirname);

        var img_name = jQuery(this).attr('index');
        var imageUrl = running_on + '/projects/' + project_path.replace(" ", "") + '/' + project_path.replace(" ", "") + '/project/' + img_name;
        //alert('gg');
        /*
        if(jQuery(this).attr('index') == "GLI.png"){
            Draw_Centers_OnMap('GLI');
        }

        if(jQuery(this).attr('index') == "NGBDI.png"){
            Draw_Centers_OnMap('NGBDI');
        }

        if(jQuery(this).attr('index') == "NGRDI.png"){
            Draw_Centers_OnMap('NGRDI');
        }

        if(jQuery(this).attr('index') == "VARI.png"){
            Draw_Centers_OnMap('VARI');
        }
        */

        // MUST READ FROM FILE BOUND BOX
        var bound_boxes = fs.readFileSync(running_on + '/projects/' + project_path.replace(" ", "") + '/stiched_images/edges.json', 'utf8');
        var json_bounds = JSON.parse(bound_boxes);
        cimageBounds = L.bounds([json_bounds["Lower_right_corner"], json_bounds["Upper_left_corner"]]);
        //cimageBounds = L.bounds([[40.573994502284826, 22.997514351202266],[40.57201471549072, 23.00005946100994]]);
        //console.log(cimageBounds.getCenter());
        imageBounds = [cimageBounds.getCenter(), [40.573994502284826, 22.997514351202266],
            [40.57201471549072, 23.00005946100994]
        ];

        L.imageOverlay(imageUrl, imageBounds, {
            className: 'calculated_rgb_vls_index'
        }).addTo(map);

    });




    // initialise function Export Project 
    function export_project(out_dir) {


        jQuery('#pop_up_container').fadeIn();
        jQuery('.pop_up_content').prepend('<div class="loader loader--style5" title="4"> <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="24px" height="30px" viewBox="0 0 24 30" style="enable-background:new 0 0 50 50;" xml:space="preserve"> <rect x="0" y="0" width="4" height="10" fill="#333"> <animateTransform attributeType="xml" attributeName="transform" type="translate" values="0 0; 0 20; 0 0" begin="0" dur="0.6s" repeatCount="indefinite" /> </rect> <rect x="10" y="0" width="4" height="10" fill="#333"> <animateTransform attributeType="xml" attributeName="transform" type="translate" values="0 0; 0 20; 0 0" begin="0.2s" dur="0.6s" repeatCount="indefinite" /> </rect> <rect x="20" y="0" width="4" height="10" fill="#333"> <animateTransform attributeType="xml" attributeName="transform" type="translate" values="0 0; 0 20; 0 0" begin="0.4s" dur="0.6s" repeatCount="indefinite" /> </rect> </svg> </div>');
        jQuery('.pop_up_content p').text('Exporting...');
        jQuery('.button_all_ok').attr('style', 'display:none;');

        const zl = require("zip-lib");

        zl.archiveFolder('./projects/' + localStorage.getItem("LoadProject").replace(" ", "") + '/', out_dir + "/" + localStorage.getItem("LoadProject").replace(" ", "") + ".zip").then(function() {
            console.log("Export done");
            jQuery('#pop_up_container').fadeOut();
            jQuery('.button_all_ok').attr('style', 'display:block;');
        }, function(err) {
            console.log(err);
            jQuery('.pop_up_content .loader').remove();
            jQuery('.pop_up_content p').text('Export failed: ' + err.message);
            jQuery('.button_all_ok').attr('style', 'display:block;');
        });


    }

    // Draw Map Click Handler
    jQuery('div#DrawOnMapGallery').click(function() {
        DrawImagesOnMap();
    });

    // Initialise function draw images on map
    function DrawImagesOnMap() {
        // Dropdown menu 
        jQuery('div#photo_picker_receiver_start').slideDown();
        // Clear all markers from the images toolbox
        console.log('working');
    }



    //debug


    /* Toast messages mechanism */
    function toast({
        title = "",
        message = "",
        type = "info",
        duration = 3000
    }) {
        const main = document.getElementById("toast");
        if (main) {
            const toast = document.createElement("div");

            // Auto remove toast
            const autoRemoveId = setTimeout(function() {
                main.removeChild(toast);
            }, duration + 1000);

            // Remove toast when clicked
            toast.onclick = function(e) {
                if (e.target.closest(".toast__close")) {
                    main.removeChild(toast);
                    clearTimeout(autoRemoveId);
                }
            };

            const icons = {
                success: "fas fa-check-circle",
                info: "fas fa-info-circle",
                warning: "fas fa-exclamation-circle",
                error: "fas fa-exclamation-circle"
            };
            const icon = icons[type];
            const delay = (duration / 1000).toFixed(2);

            toast.classList.add("toast", `toast--${type}`);
            toast.style.animation = `slideInLeft ease .3s, fadeOut linear 1s ${delay}s forwards`;

            toast.innerHTML = `
                          <div class="toast__icon">
                              <i class="${icon}"></i>
                          </div>
                          <div class="toast__body">
                              <h3 class="toast__title">${title}</h3>
                              <p class="toast__msg">${message}</p>
                          </div>
                          <div class="toast__close">
                              <i class="fas fa-times"></i>
                          </div>
                      `;
            main.appendChild(toast);
        }
    }

    /* 
     Return Folders of PhotoGallery
    */
    function getDirectoriesGallery(path) {
        return fs.readdirSync(path).filter(function(file) {
            return fs.statSync(path + '/' + file).isDirectory();
        });
    }

    jQuery('h6#photo_gallery_list').click(function() {

        jQuery('.gallery_list_dynamic li').remove();
        var running_on = path.resolve(__dirname);
        var plan_name = localStorage.getItem("LoadProject");
        var get_galleries = getDirectoriesGallery(running_on + '/projects/' + plan_name.trim() + '/project_images/');
        //console.log(get_galleries);


        try {
            get_galleries.forEach(element => {
                console.log(element)
                var date = new Date(parseInt(element));
                date = date.getDate() + "/" + (date.getMonth() + 1) + "/" + date.getFullYear() + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
                var complete_path = running_on + '/projects/' + plan_name.trim() + '/project_images/' + element;
                jQuery('.gallery_list_dynamic').append('<li path_of_image="' + complete_path + '" class="nav-item slider_inside_li"> <div class="slider_title"> <label>' + date + '</label> </div> </li>');
                // end foreach
            });

        } catch {
            console.log('No Gallery So Far');
        }

        //console.log(timeConverter());

    });

    /* Trigger Toggle and draw Markers Mechanism */
    jQuery('.checkbox input:checked').length;

    jQuery('.checkbox input:checked').length;

    jQuery('.model-7 input').change(function() {

        const pathsb = require('path');
        var running_on = pathsb.resolve(__dirname);
        var path_of_json = running_on + '/projects/' + project_path.replace(" ", "") + '/' + project_path.replace(" ", "") + '/project/';

        var item_get = jQuery(this).attr('indeces_selection');

        if (item_get == "gli_markers") {

            // Is enabled
            if (jQuery('input[indeces_selection="gli_markers"]:checked').length == 1) {
                // Draw Markers
                var gli_centers = fs.readFileSync(path_of_json + '/GLI.json', 'utf8');
                console.log(gli_centers);
                var gli_centers_json = JSON.parse(gli_centers);

                /* CREATING MARKERS FOR GLI CENTERS */

                for (var item in gli_centers_json) {

                    var lat = gli_centers_json[item]["Lon"];
                    var lon = gli_centers_json[item]["Lat"];
                    var img_near = gli_centers_json[item]["Nearest_image"];
                    img_near = img_near.split(" ");
                    var path_of_photos = localStorage.getItem("Save_Image_Path");
                    path_of_photos.replace("\\", "/");
                    marker = new L.marker([lon, lat], {
                        title: "" + lon + "," + lat,
                        alt: "markers_of_gli",
                        icon: alert_indeces
                    }).bindPopup('<img src=' + path_of_photos + '/' + img_near[0] + '><div onfile="gli" its_item="' + item + '" class="remove_this">Remove</div>').addTo(map);
                    //console.log(lat,lon);

                }


            } else {
                // Remove Markers
                jQuery('img[alt="markers_of_gli"]').remove();
            }

        } else if (item_get == "nbgdi_markers") {

            if (jQuery('input[indeces_selection="nbgdi_markers"]:checked').length == 1) {
                //alert('NGBDI');
                var ngbdi_centers = fs.readFileSync(path_of_json + '/NGBDI.json', 'utf8');
                var ngbdi_centers_json = JSON.parse(ngbdi_centers);


                /* CREATING MARKERS FOR NGBDI CENTERS */
                for (var item in ngbdi_centers_json) {
                    var lat = ngbdi_centers_json[item]["Lon"];
                    var lon = ngbdi_centers_json[item]["Lat"];
                    var img_near = ngbdi_centers_json[item]["Nearest_image"];
                    img_near = img_near.split(" ");
                    var path_of_photos = localStorage.getItem("Save_Image_Path");
                    path_of_photos.replace("\\", "/");
                    marker = new L.marker([lon, lat], {
                        title: "" + lon + "," + lat,
                        alt: "markers_of_nbgdi",
                        icon: alert_indeces
                    }).bindPopup('<img src=' + path_of_photos + '/' + img_near[0] + '><div onfile="ngbdi" its_item="' + item + '" class="remove_this">Remove</div>').addTo(map);

                }

            } else {
                jQuery('img[alt="markers_of_nbgdi"]').remove();
            }


        } else if (item_get == "ngrdi_markers") {

            if (jQuery('input[indeces_selection="ngrdi_markers"]:checked').length == 1) {

                var ngrdi_centers = fs.readFileSync(path_of_json + '/NGRDI.json', 'utf8');
                var ngrdi_centers_json = JSON.parse(ngrdi_centers);

                /* CREATING MARKERS FOR ngrdi_centers_json CENTERS */
                for (var item in ngrdi_centers_json) {
                    var lat = ngrdi_centers_json[item]["Lon"];
                    var lon = ngrdi_centers_json[item]["Lat"];
                    var img_near = ngrdi_centers_json[item]["Nearest_image"];
                    img_near = img_near.split(" ");
                    var path_of_photos = localStorage.getItem("Save_Image_Path");
                    path_of_photos.replace("\\", "/");

                    marker = new L.marker([lon, lat], {
                        title: "" + lon + "," + lat,
                        alt: "markers_of_ngrdi",
                        icon: alert_indeces
                    }).bindPopup('<img src=' + path_of_photos + '/' + img_near[0] + '><div onfile="ngrdi" its_item="' + item + '" class="remove_this">Remove</div>').addTo(map);

                }



            } else {
                jQuery('img[alt="markers_of_ngrdi"]').remove();
            }


        } else if (item_get == "vari_markers") {

            if (jQuery('input[indeces_selection="vari_markers"]:checked').length == 1) {

                var vari_centers = fs.readFileSync(path_of_json + '/VARI.json', 'utf8');
                var vari_centers_json = JSON.parse(vari_centers);

                /* CREATING MARKERS FOR vari CENTERS */
                for (var item in vari_centers_json) {
                    var lat = vari_centers_json[item]["Lon"];
                    var lon = vari_centers_json[item]["Lat"];
                    var img_near = vari_centers_json[item]["Nearest_image"];
                    img_near = img_near.split(" ");
                    var path_of_photos = localStorage.getItem("Save_Image_Path");
                    path_of_photos.replace("\\", "/");

                    marker = new L.marker([lon, lat], {
                        title: "" + lon + "," + lat,
                        alt: "markers_of_vari",
                        icon: alert_indeces
                    }).bindPopup('<img src=' + path_of_photos + '/' + img_near[0] + '><div onfile="vari" its_item="' + item + '" class="remove_this">Remove</div>').addTo(map);

                }


            } else {
                jQuery('img[alt="markers_of_vari"]').remove();
            }



        }

    });

    /* Create function that triggers the image checking of Weed Detection for speccific marker  */
    jQuery(document).on('click', 'img[src="img/Alert_Indeces.png"]', function() {
        //alert("click bound to document listening for #test-element");
        const pathsb = require('path');
        var running_on = pathsb.resolve(__dirname);

        var get_pin_name = jQuery(this).attr('title');
        var full_path = running_on + '/projects/' + localStorage.getItem("LoadProject").replace(" ", "") + '/weed_detection_markers_photo/' + get_pin_name + '/results/';

        if (fs.existsSync(full_path)) {
            // enter the code to excecute after the folder is there.\
            var filesArray = fs.readdirSync(full_path).filter(file => fs.lstatSync(full_path + file).isFile())
            console.log(filesArray);
            // Initial remove class from hide it 
            jQuery('#detection_carousel').removeClass('hide_it');
            jQuery('#the_closer_of_slick').removeClass('hide_it');
            // Animate slick slider for weed detection
            jQuery('#detection_carousel').fadeIn();
            jQuery('#the_closer_of_slick').fadeIn();

            try {
                jQuery('.portfolio-slides').slick('unslick');
                jQuery('div#detection_carousel').html('');
            } catch {
                console.log('isnotslickslider')
            }


            filesArray.forEach(element => {

                console.log(element);
                var exi_img_path = full_path + '/' + element;
                jQuery('#detection_carousel ').append('<div class="single"> <a href="' + exi_img_path + '"> <img src="' + exi_img_path + '" /> </a> </div>');

            });

            /* Build Slick Slider */
            jQuery('.portfolio-slides').slick({
                slidesToShow: 5,
                slidesToScroll: 1,
                autoplay: true,
                autoplaySpeed: 2000,
                arrows: true,
                dots: true,
                responsive: [{
                        breakpoint: 1300, // tablet breakpoint
                        settings: {
                            slidesToShow: 3,
                            slidesToScroll: 1
                        }
                    },
                    {
                        breakpoint: 1150, // mobile breakpoint
                        settings: {
                            slidesToShow: 2,
                            slidesToScroll: 2
                        }
                    }
                ]

            });

            jQuery('.portfolio-slides').slickLightbox({
                itemSelector: 'a',
                navigateByKeyboard: true
            });
           

        } else {
            console.log('Not results eists');
        }


    });



    jQuery('#the_closer_of_slick').click(function() {
        jQuery(this).fadeOut();
        jQuery('div#detection_carousel').fadeOut();

    });


    // End

});