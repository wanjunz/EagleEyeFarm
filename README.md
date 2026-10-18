<p align="center"><img src="img/brand/logo.png" width="140" alt="Eagle Eye logo"></p>

# Eagle Eye

**Field scouting with an affordable drone and what3words**

- [Part 1: What it does](#part-1-what-it-does) (for farmers, partners and supporters)
- [Getting started](#getting-started)
- [Part 2: Technical specification](#part-2-technical-specification) (for engineers and reviewers)
- [Credits and licences](#credits-and-licences)

---

## Part 1: What it does

### The problem

Walking a field to find weeds, dry spots or struggling crops takes hours, and problems are easy to miss until they spread. Professional mapping drones and agronomy software often cost thousands of dollars. Many small farms can't justify that.

### The idea

Eagle Eye turns a low-cost consumer drone, the **Potensic Atom 2**, into a field-scouting tool. Software that runs on an ordinary laptop does the analysis.

### What you can do with it

- **Describe your field with four what3words addresses.** Every 3 m × 3 m square on Earth has a unique three-word name, such as `///filled.count.soap`. Enter the four corners of your field and the app draws it on a satellite map and works out its size. No surveying, no drawing by hand.
- **Plan the flight automatically.** The app plans a back-and-forth route over the whole field, with photos spaced so they overlap. It estimates flight time and splits long flights into battery-sized parts. Missions are built for the drone's own app, Potensic Eve.
- **See your whole field from above.** After the flight, import the photos straight from the drone's memory card. The app matches the overlapping photos in 3D (structure from motion) and joins them into one seamless, true-to-scale map of the field, then checks that map for crop health and weeds. Without the 3D-matching software it places each photo by its GPS position instead.
- **Crop-health maps.** The field is coloured from red (stressed or bare) to green (healthy), using four crop-health measures that work from ordinary colour photos. The app marks the patches that need attention with numbered pins.
- **Weed maps.** A model trained on expert-labelled drone photos of a real cotton field outlines likely weed patches in purple and reports how much of the field they cover.
- **One number for crop health, one for weeds.** After the analysis, Eagle Eye sums up the whole field in two numbers: a crop-health score out of 100 (for example 96 = Good) and the share of the field with weeds (for example 4.4% = Moderate). One click shows on the map exactly which spots need a look and why: thin crop, pale crop or bare patches.
- **Send the drone back for a closer look.** One click plans a low flight over each problem patch, for close-up photos that the weed check analyses again.
- **Fly to one spot.** Type one what3words address and the drone goes to that square, takes a photo, and the app checks that spot for crop health and weeds.
- **Works on the phone too.** A simple web page turns what3words addresses into the exact coordinates to enter in the drone app on iPhone, with a map of numbered pins.

### Why it matters

- **Low cost:** a consumer drone plus free, open-source software.
- **Saves time:** scout a whole field in one short flight instead of walking it.
- **Targeted action:** treat or check only the patches that need it. That saves herbicide, fertiliser and labour.
- **Easy to share:** a what3words address is easy to say, text or write down when telling a worker or advisor exactly where the problem is.
- **Grounded in research:** the methods follow published drone and satellite farming research. [docs/RESEARCH.md](docs/RESEARCH.md) reviews 15 papers.

### Tested on real farm photos

The full workflow was run on 365 real drone photos of a cotton field in Larissa, Greece (a public, expert-labelled dataset, Krestenitis et al. 2022):

- All photos landed in the right place on the satellite map.
- Weeds covered 4.4% of the field in the weed map. The experts' labels cover about 4.3–4.4% of the same photos.
- The whole field was analysed in about 7.5 minutes on a laptop.

3D matching (structure from motion) was tested on 40 overlapping photos of a farm in Ohio, USA (a public CC0 dataset), straight from a drone's memory card:

- 26 of the 40 photos were matched in 3D and joined into one seamless map at 2.2 cm per pixel. It lines up with satellite imagery: roads and field edges match. The 14 photos that could not be matched leave a gap.
- 3D matching took about 6.5 minutes and the analysis about 3.5 minutes on a laptop.
- The field was bare soil, and Eagle Eye correctly reported "No crop seen" instead of a misleading score.
- The Greek cotton photos do not overlap enough for 3D matching, so the automatic setting places them by GPS.

### What to know (honest limits)

- **The drone app still needs one tap.** Potensic offers no way for outside software to launch the drone, so the pilot presses Start in the Eve app. On Android, missions load automatically; on iPhone, waypoints are entered by hand from the coordinates the app provides.
- **Colour camera only.** The Atom 2 has no thermal or near-infrared camera. Red areas mean "go and look", not a diagnosis. Early water stress, early disease and exact nitrogen levels need specialised cameras.
- **Weed detection is good, not perfect.** It finds weed patches, not species. It was trained on cotton, so other crops need extra training data to reach the same accuracy.
- **3D matching needs overlap and time.** Photos must overlap by about 70% (scans planned in the app do), and it needs Docker Desktop and several minutes on a laptop. Single, scattered photos fall back to GPS placement.
- **Real what3words addresses need a paid what3words API key.** A free test mode uses sample addresses (Donnelly Field, Cambridge MA; and the Greek test field).
- **Always fly within sight and follow local drone rules.**

### Coming next (planned, not yet built)

- **Irrigation check:** map wet and dry soil around drip lines, spot dry gaps and waterlogged spots, and compare with recent rainfall.
- **Changes over time:** compare repeat flights to see which areas get worse.
- **Deep-learning weed model:** a larger neural network for higher accuracy.

---

## Getting started

### Requirements

- **Node.js 20+** (tested on 24).
- **For 3D matching (structure from motion):** [Docker Desktop](https://www.docker.com/products/docker-desktop/). It runs OpenDroneMap, which downloads about 3 GB the first time; leave at least 10 GB of disk free, and give Docker 8 GB of memory or more (Settings → Resources) for full-detail maps. Everything else works without it.
- **For sending missions to an Android phone:** Android platform-tools (`adb`). On a Mac: `brew install android-platform-tools`.

```bash
git clone <this repo> && cd <repo>
npm install
npm test          # automated tests; no key, phone or drone needed
npm start         # desktop app
```

If `npm start` fails inside VS Code's built-in terminal, run `unset ELECTRON_RUN_AS_NODE` first, or use the regular Terminal app.

### what3words API key

Converting a three-word address into coordinates needs a **paid** what3words plan; the free plan only offers autosuggest. Get a key at [developer.what3words.com](https://developer.what3words.com), then either paste it into *what3words settings* in the app, or set `export W3W_API_KEY=your-key` for the command line and web page.

**No key yet?** The app uses test mode automatically. It only knows the sample addresses in [test/fixtures/w3w/](test/fixtures/w3w/), for example `///donnelly.field.cambridge`, `///donnelly.field.northeast`, `///donnelly.field.southeast` and `///donnelly.field.southwest` (the corners of Donnelly Field, Cambridge, MA). Apart from `///filled.count.soap`, these are made up for testing and are not real what3words addresses.

### Atom 2 preparation (once)

1. Update the Atom 2 to firmware **V020 or newer** and install the latest Potensic Eve app.
2. **Android only:** turn on Developer options → **USB debugging**, plug the phone into the computer and accept the prompt.
3. In Eve, create any **one-point waypoint mission** and save it. This is the placeholder the app overwrites.

### Scan a whole field

1. **Set up a new field:** type the what3words address of each of the four corners, press **Find field**, name the field and save.
2. On the field page, work down the steps on the left:

| Step | What you do | What the app does |
|---|---|---|
| 1. Plan the scan | **Plan scan path** | Draws a back-and-forth route with photo points along each line (75% front, 65% side overlap). Shows the number of photos, flight time and area; long scans are split into battery-sized parts |
| 2. Send to the Atom 2 | Android on USB → pick the placeholder mission → **Send scan to Atom 2** | Writes the route into that Eve mission. In Eve: Waypoints → the mission → **Start** |
| 3. Import photos | Put the drone's microSD card in the computer → **Import photos** → pick the DCIM folder | Copies the photos and reads each one's GPS position, camera and size |
| 4. Analyse & stitch | Choose how to join the photos (**Automatic** is recommended) → **Analyse photos & stitch maps** | Joins the photos into one map by 3D matching (or by GPS), then checks it for crop health and weeds |
| 5. Field maps | Switch between **PHOTOS / GLI / VARI / NGRDI / NGBDI / WEEDS** | Crop-health maps go from red (stressed or bare) to green (healthy), with numbered problem areas. The weed map shows likely weeds in purple |
| 6. Field health summary | Read the two numbers → **Show where to look** / **Show weed map** | **Crop health** out of 100 (Good / Fair / Poor) and **Weeds** as a % of the field (Low / Moderate / High) |
| 7. Close-up flight | **Plan close-up flight** → **Send close-up flight to Atom 2** | A low flight (6 m by default) that photographs each problem area straight down |
| 8. Close-up weed check | **Import close-up photos** | Runs the weed model on the sharper close-ups |

**Flight height for weeds:** the weed model needs about 2 cm of ground per pixel or less. The app warns when photos or the stitched map are coarser. For crop-health maps alone you can fly higher (20–40 m); for weeds, fly lower or use the close-up flight.

### Fly to one spot

1. On the home screen, choose **Fly to one spot**.
2. Type the address, set height and camera angle, and press **Find square**.
3. **Android:** pick the placeholder mission and press **Send to Atom 2**. **iPhone:** open *iPhone: enter by hand in Eve* and copy the values into Eve.
4. In Eve: Waypoints → open the mission → **Start**.
5. After the flight, press **Analyse the photo** and pick the photo from the SD card.

### Command line and phone web page

```bash
node bin/w3w-fly.js ///filled.count.soap --mock                        # try it without a key
node bin/w3w-fly.js ///your.three.words --mission 1739000000000 --push # overwrite an Eve mission over USB
WEB_PASSWORD=choose-a-password npm run web                             # phone page at http://<computer IP>:8080
```

The phone page turns up to 30 what3words addresses into numbered waypoint coordinates (decimal, degrees/minutes/seconds and Apple Maps links) with a satellite map, for entering in Eve on iPhone. On Android it also downloads the mission files. The what3words key stays on the server, and each device gets 20 lookups per minute.

---

## Part 2: Technical specification

### 2.1 System overview

| Layer | Technology / location |
|---|---|
| Desktop app | Electron 33, Leaflet maps, jQuery UI |
| Analysis engine | Node.js modules in `js/analysis/`; image handling with sharp (libvips); no Python or GPU needed at run time |
| 3D matching | OpenDroneMap 3.6.2 in Docker (`js/analysis/stitching.js`, `js/analysis/ortho_analysis.js`) |
| Drone link | `js/drones/`: Potensic Eve mission files, Android push via adb |
| what3words | `js/w3w/`: REST API v3 client, waypoint conversion, test mode |
| Phone web page | Express server in `server/` (password protected, rate limited) |
| Command line | `bin/w3w-fly.js` |
| Model training | Python + scikit-learn, offline only (`tools/`) |
| Tests | 61 automated tests (`node --test`), including real-data regression tests |

Every analysis step reads and writes files in the project folder (`projects/<name>/...`), so steps can be rerun and results reload when a project is reopened.

End-to-end flow:

```
4 what3words corners -> field polygon -> coverage path -> Eve mission
-> flight -> SD-card photos -> import (EXIF)
-> 3D matching (structure from motion) -> orthomosaic -> analysis in 30 m tiles
   (or: per-photo analysis -> photos placed by GPS)
-> crop health + problem areas + weeds + field summary -> stitched field maps
-> close-up mission over problem areas -> close-up weed analysis
```

### 2.2 what3words

Files: `js/w3w/what3words.js`, `js/w3w/waypoints.js`, `js/field_corners.js`

- **Lookup:** `GET https://api.what3words.com/v3/convert-to-coordinates` (key sent as the `X-Api-Key` header). Returns the centre coordinates and the 3 m square.
- **Input checks:** a Unicode-aware pattern for `word.word.word`, with optional `///` in front.
- Repeat lookups are cached in memory.
- API errors (BadWords, InvalidKey, quota 402, network) become plain-language messages.
- **Test mode:** used automatically when no API key is set. Sample fixtures live in `test/fixtures/w3w/`: made-up addresses at real places (the four Donnelly Field corners from the OpenStreetMap park boundary, four Larissa cotton-field corners) plus `filled.count.soap`, a real example address from the what3words documentation.
- **Field corners:** the four results are sorted by angle around their centre, so the outline never crosses itself. Area is computed with `@mapbox/geojson-area`; fields under 100 m² are rejected.
- **Waypoint conversion for iPhone** (Eve does not accept what3words):
  - up to 30 addresses become numbered waypoints;
  - formats: decimal to 6 decimal places (~0.1 m), degrees-minutes-seconds, Apple Maps and Google Maps links;
  - optional clockwise loop order for field corners;
  - duplicate and invalid addresses are reported separately, without stopping the rest.

### 2.3 Flight planning and the Potensic Atom 2

Files: `js/analysis/path_planner.js`, `js/drones/potensic_atom2.js`, `js/drones/adb_transfer.js`

**Coverage path**

- **Projection:** the field is converted to a local east/north metre grid (equirectangular, around the field centre), then rotated to the chosen flight direction. Latitude and longitude are kept in the correct order, so spacing is not distorted anywhere on Earth.
- **Lines:** horizontal scan lines are intersected with the polygon (even-odd rule); no-fly zone intervals are subtracted; lines alternate direction (serpentine).
- **Photo footprint:** width = 2 × height × tan(horizontal FOV / 2).
- **Spacing:** between lines = footprint width × (1 − 0.65 side overlap); between photos = footprint length × (1 − 0.75 front overlap). Photo waypoints are placed along each line, because the Atom 2 only takes mission photos at waypoints. This overlap is also what 3D matching needs.
- **Outputs:** waypoints, line count, flight time (distance / speed + hover time) and area.
- **Close-up flights:** problem points are ordered by nearest neighbour, flown at 6 m by default.

**Eve mission format** (unofficial; reverse-engineered by the HOT Drone Tasking Manager team)

- Files: `global.json` (finishAction, lostAction, speed, ...) and `<id>.json`, holding `[waypoints];[pois]`.
- Each waypoint: lat, lng, height, hoverTime, gimbalPitch, yaw, action PHOTO.
- Safety checks: height 2–120 m, gimbal −90…+20°, speed up to 15 m/s. Missions are split at 99 points.
- **Android:** adb lists existing missions in `/sdcard/Android/data/com.ipotensic.atom/files/Waypoint/`, overwrites one with `adb push`, then force-stops Eve so it reloads. Eve deletes mission folders it did not create, so a placeholder mission made in Eve is overwritten. adb is found in common install locations.
- **iPhone:** app files cannot be written from outside, so the app outputs coordinates and an "enter in Eve" step list instead.

### 2.4 Photo import

File: `js/analysis/photos.js`

- EXIF read with piexifjs: GPS (degrees/minutes/seconds to decimal), capture time, camera make and model.
- Image size is read from the JPEG frame header, without decoding the image.
- Camera field of view by model: DJI FC6310 73.7°; Potensic Atom 2 about 80° (assumed, since Potensic doesn't publish it; can be overridden).
- Ground footprint comes from the flight height entered (EXIF altitude is above sea level, not above the field).
- Photo direction (heading): `north` for missions from this app (default); `travel` and `travel-reverse` (bearing between neighbouring photo positions) for photos from other apps.
- Photos without GPS are matched in order to the planned waypoints.

### 2.5 Joining the photos: structure from motion or GPS placement

Step 4 offers three choices: **Automatic** (default: 3D matching when Docker is running and the scan has at least 5 photos, otherwise GPS placement, with a note saying why), **3D matching only**, and **GPS placement only**. Both methods produce the same files (`analysis.json` and six map layers), so everything after step 4 works the same way.

**A. Structure from motion (3D matching)** — `js/analysis/stitching.js`, `js/analysis/ortho_analysis.js`

Photos taken straight from the drone are not map-ready: the GPS is off by 1–3 m, the camera tilts a little, and the ground is not perfectly flat. Structure from motion fixes all three.

- **How it works:** OpenDroneMap detects distinctive features in every photo, matches them between overlapping photos, and solves for every camera's exact position and angle together with a 3D point cloud of the field (bundle adjustment). It then builds the field's surface and projects each photo straight down onto it, giving one seamless, true-to-scale orthomosaic.
- **Run:** `docker run --rm -v <scan>/sfm:/datasets opendronemap/odm:3.6.2 --project-path /datasets project --fast-orthophoto --skip-3dmodel --skip-report --feature-quality medium --orthophoto-resolution 2`. OpenDroneMap never goes finer than the photos' own ground resolution, so 2 cm means "as sharp as the photos".
- **Photos without GPS** (positions taken from the flight plan) are passed to OpenDroneMap in a `geo.txt` file.
- **Re-projection:** GDAL's Python bindings inside the same container warp the UTM orthophoto to latitude/longitude (EPSG:4326), with pixel sizes chosen so each pixel stays square on the ground, and read its bounds.
- **Analysis on the orthomosaic:**
  - one shared colour range per index, from a 1500 px copy of the whole map;
  - the map is cut into tiles of about 30 m × 30 m at full resolution, and each tile goes through exactly the same code as a photo: the four indices, problem areas, weed windows (7.5 m) and the 4 m summary areas;
  - pixels outside the map (transparent) are ignored everywhere: they are never flagged, never weeds, and summary areas less than half covered are dropped, so the field edge does not look like thin crop;
  - tiles less than 5% covered are skipped; field-wide numbers are weighted by how much of the field each tile covers;
  - the tile results are joined at one scale into the same six layers (photos, GLI, VARI, NGRDI, NGBDI, weeds), at most 5000 px on the long side.
- **Reuse:** the result is kept in `scans/<id>/sfm/` and reused when step 4 is run again, unless new photos were imported.
- **Memory:** texturing the map is the most memory-hungry stage. If Docker runs out of memory (exit code 137), the app keeps the finished 3D reconstruction and retries once at 4 cm per pixel (`--rerun-from odm_meshing`), and tells the user how to get the sharper map.
- **Needs:** Docker Desktop with about 8 GB of memory for 2 cm maps, about 3 GB download the first time, about 10 GB free disk, at least 5 photos overlapping by about 70%.

- **No crop:** if the field's typical green cover is under 5% (bare soil, or the crop is not up yet), the summary reports "No crop seen" instead of a crop-health score, since it would only be comparing soil colours.
- **Tested** on 40 overlapping photos of an Ohio farm (CC0): 26 photos in one reconstruction, map at 2.2 cm per pixel, 50 tiles analysed; OpenDroneMap about 6.5 min and analysis about 3.5 min on an 8 GB MacBook with Docker at 4 GB. One run at 2 cm hit Docker's 4 GB limit (exit code 137), which is why the retry exists. OpenDroneMap's working files (close to 1 GB per scan) are deleted afterwards; only the orthophotos are kept. The Greek cotton photos fail feature matching (too little overlap between frames), so automatic mode falls back to GPS for them.

**B. GPS placement** — `js/analysis/mosaic.js`

- Each photo is analysed on its own, then placed on the map by its GPS position, sized from the flight height and camera field of view.
- Each footprint corner is rotated by heading into a local east/north frame; the union of all footprints defines the canvas (native resolution, at most 5000 px on the long side).
- Each tile is resized, rotated with a transparent background and composited onto the canvas, in batches of 60. The same layout renders every layer, so layers line up exactly.
- **Limits:** assumes flat ground and a straight-down camera, and neighbouring photos can be offset by the GPS error (typically 1–3 m). It works for any photos with GPS, even ones that do not overlap, and takes about 1 second per photo.

### 2.6 Vegetation health estimation

File: `js/analysis/indices.js`

Four RGB indices, computed per pixel as Float32 and clipped to [−1, 1] (a small constant is added to each denominator):

| Index | Formula | Name |
|---|---|---|
| GLI | (2G − R − B) / (2G + R + B) | Green Leaf Index |
| VARI | (G − R) / (G + R − B) | Visible Atmospherically Resistant Index |
| NGRDI | (G − R) / (G + R) | Normalised Green-Red Difference Index |
| NGBDI | (G − B) / (G + B) | Normalised Green-Blue Difference Index |

- **Display range:** a 100-bin histogram over [−1, 1]; keep the bins holding more than 5% of valid pixels (fallback: the 2nd–98th percentile). For a field scan, one shared range is computed for the whole field, so colours are comparable everywhere.
- **Colour map:** RdYlGn, red = low (stressed or bare), green = high (healthy); transparent where there is no data.
- **Outputs:** a colour PNG per photo or tile and per index; mean and low-value share per photo or tile and per field.
- **Limit:** RGB only. These indices approximate canopy vigour; they are not NDVI.

### 2.7 Problem area detection

File: `js/analysis/problem_areas.js`

1. Smooth over about 1.5 m with a box blur that ignores missing pixels. It uses running sums, so its cost does not depend on the blur size. This stops bare soil between crop rows from being reported.
2. **Threshold:** a pixel is flagged when its value is below min(lowest 25% of the display range, field median − 0.05). The median test stops sensor noise in an evenly healthy field from being flagged.
3. **Clean-up:** 5×5 binary closing, then opening. Pixels touching diagonally count as connected (8-connected flood-fill labelling).
4. Keep patches from 1 m² up to 60% of the photo.
5. Merge patches within 4 m of each other (single-linkage), since one close-up photo covers them. Centres are weighted by patch area.
6. Convert each centre from pixels to latitude/longitude, including the photo's rotation. Merge across photos or tiles. Output: up to 20 points per index, also written to `problematic_areas_points.json`.

Benchmark against an earlier k-means implementation of this step, run unmodified on synthetic 50 × 37.5 m maps at 5 cm/px with crop rows every 0.9 m and noise (a patch counts as found if a point lands within 1.5 m of its centre):

| Test case | Earlier implementation | Eagle Eye |
|---|---|---|
| two patches | 0/2 found, 3 false alarms | 2/2 found, 0 false |
| two patches, no rows | crash | 2/2 found, 0 false |
| two patches + map border | 0/2 found, 4 false alarms | 2/2 found, 0 false |
| healthy field | 2 false alarms | 0 false alarms |
| one patch | 0/1 found, 2 false alarms | 1/1 found, 0 false |
| patches + dark spot | crash | 2/2 found, 0 false |
| twelve patches | 2/12 found, 6 false alarms | 12/12 found, 0 false |
| worst map-position error | 93 m (rows/cols swapped) | 0 m |

The harness to reproduce this is in `tools/compare_problem_areas/`.

### 2.8 Weed detection

Files: `js/analysis/weed_model.js`, `js/analysis/photo_analysis.js`, `tools/train_weed_model.py`, `js/analysis/models/weed_gbt.json`

**Is it deep learning? No.** The best published model for this dataset (a U-Net with an EfficientNet-B1 encoder) has no public trained weights, so it cannot be run. Eagle Eye uses a trained gradient-boosted decision-tree model instead.

**Data:** drone photos of cotton in Larissa, Greece, taken by a DJI Phantom 4 Pro at about 5 m (Krestenitis et al. 2022, CC-BY-4.0); 201 photos with expert labels (3 weed species, merged into "weed").

**Cells:** the image is resized to 1280×720 and split into 40 × 22 = 880 cells, each about 19 cm on the ground. A cell is "weed" if at least half its pixels are labelled weed. Training set: 176,880 cells.

**Features** (36 per cell, computed by the same JavaScript code during training and in the app):

- 18 basic features: mean and spread of brightness, Excess Green and saturation; Excess Red; brightness-gradient mean and spread (texture) and edge density; average red, green and blue proportions; share of green-plant pixels (Excess Green with an automatic Otsu threshold); brightness and Excess Green relative to the image median; share of dark and of bright pixels.
- 2 crop-row features: the row direction is found by testing angles from 0 to 180° in 3° steps and choosing the one where green pixels form the sharpest stripes; row spacing comes from the autocorrelation of that stripe pattern. Features: each cell's distance to the nearest row (as a fraction of the spacing), and whether rows were found.
- 14 neighbourhood features: 7 of the basic features averaged over the 3×3 and 7×7 surrounding cells.
- 2 difference features: a cell compared with its neighbourhood.

**Model** (two-stage "auto-context"):

- Stage 1: scikit-learn HistGradientBoostingClassifier (250 iterations, 31 leaves, learning rate 0.06, minimum 40 samples per leaf, L2 = 1.0).
- Stage 2: the same classifier, given the 36 features plus stage-1 probabilities around each cell (its own; means over 3×3, 7×7 and 15×15 cells; maximum over 7×7). Stage 2 is trained on stage-1 predictions made without seeing the same photo (4-fold cross-validation grouped by photo), so it learns from realistic inputs.
- Output: probabilities averaged over 3×3 cells, then a decision threshold chosen by cross-validation on training photos only (0.25 for the shipped model).
- Export: both tree ensembles are saved as JSON (0.9 MB) and run in plain JavaScript. The exported model reproduces scikit-learn's probabilities exactly.

**How the app applies it:** each photo or orthomosaic tile is cut into windows about 7.5 m wide (the training scale). Each window is resized to 1280×720, run through the model, and the results are joined back into one weed map. Images coarser than 2 cm per pixel trigger a "fly lower" warning. Outputs: a transparent purple overlay, the photo with the overlay, weed cover % and weed patch locations.

**Accuracy** on the dataset's three published test splits (weed IoU % / background IoU % / mean IoU %):

| Split | Published U-Net (weights not released) | Eagle Eye model | Simple "green between rows" rule |
|---|---|---|---|
| 1 | 44.9 / 95.4 / 70.2 | 34.5 / 94.4 / 64.4 | 0.6 / 91.7 / 46.2 |
| 2 | 43.5 / 95.8 / 69.7 | 30.8 / 94.3 / 62.6 | 0.6 / 87.7 / 44.1 |
| 3 | 44.0 / 96.6 / 70.3 | 35.9 / 95.3 / 65.6 | 0.5 / 88.7 / 44.6 |

The published U-Net scores about 10 points higher on weed IoU but cannot be run. This model is the most accurate one that actually runs.

**Upgrade path:** train a U-Net on the same data on a GPU, export it to ONNX and run it with onnxruntime-node. That adds a real deep-learning model without needing Python at run time.

### 2.9 Field health summary

File: `js/analysis/field_summary.js`

Two headline numbers, so the farmer doesn't have to read six maps.

**Crop health score (0–100)**

- The field (each photo, or each orthomosaic tile) is split into areas of about 4 × 4 m on the ground: wide enough to span several crop rows, so row spacing isn't mistaken for gaps.
- For each area: green canopy cover using the Canopeo rule (Patrignani & Ochsner 2015: R/G < 0.95, B/G < 0.95 and 2G − R − B > 20; fixed thresholds, so every image is judged the same way); plant greenness (GLI averaged over canopy pixels only); and the share of the area inside stressed/bare patches (section 2.7).
- An area "needs a look" if its crop is **thin** (cover < 70% of the field's median cover), **pale** (plant GLI more than 0.03 below the field's median) or **patchy** (25% or more in stressed/bare patches).
- Score = 100 × share of areas that do not need a look. Ratings: 85–100 Good, 65–84 Fair, below 65 Poor.
- The flagged areas are saved with their map corners; **Show where to look** draws them on the map with the reason.
- **Limit:** the score compares each part of the field with the rest of the same field, which keeps it consistent across cameras and light. It cannot detect a field that is evenly stressed; compare scans over time for that.

**Weeds (%):** the share of the photographed field covered by likely weed patches (section 2.8). Ratings: under 2% Low, 2–10% Moderate, over 10% High.

**Result on the Greek cotton field** (365 photos, 730 areas): crop health 96/100 (Good), with 3% thin crop, 1.9% pale crop and 0.4% bare/stressed patches; weeds 4.4% (Moderate). Checked by eye: flagged areas are sparse or bare spots (field edges, missing plants); typical areas are full crop rows. Older analyses get the summary added on demand (about 0.2 s per photo) without re-running the full analysis.

### 2.10 Field analysis pipeline

File: `js/analysis/pipeline.js`

- **planScan:** field polygon + no-fly zones → coverage waypoints → Eve missions.
- **importScan:** copies the photos to `scans/<id>/images` and records photo height and heading.
- **analyzeScan** (`method`: `auto`, `sfm` or `gps`):
  - *sfm:* OpenDroneMap orthomosaic → shared colour ranges → 30 m tiles analysed like photos → six joined layers;
  - *gps:* pass 1 computes index values at 300 px for one shared colour range per index; pass 2 analyses each photo (about 1.2 s on Apple Silicon); then the six layers are stitched by GPS;
  - both end with the field health summary (section 2.9) and `analysis.json`.
- **planHotpoints:** problem points → close-up mission (6 m, nearest-neighbour route).
- **importCloseups:** weed analysis of the close-up photos.
- **analyzeSinglePhoto:** crop health and weeds for one what3words photo, with a warning if the photo's GPS is far from the square.

Measured on the Greek test field with GPS placement (365 photos, 5 m, DJI Phantom 4 Pro): import under 1 s, analysis about 6.7 min, stitching about 40 s; weed cover 4.4% (experts' labels about 4.3–4.4%); GLI problem patches 0.2% of the area (soil between rows correctly not flagged).

### 2.11 Other engineering work

- **Upgrades:** Electron 5 → 33 and sharp 0.26 → 0.33, for Apple Silicon and current Node.js.
- **Removed:** the old DJI MQTT radio link and Windows-only .exe/.bat tools; the Atom 2 is the only supported drone.
- **Maps:** Esri World Imagery basemap. The deepest available imagery level is detected per location through Esri's tilemap service, which avoids "Map data not yet available" tiles.
- **Fixed:** blank screens after creating or loading a project (asynchronous save race; project names with spaces); timeline crash on new projects; Import and Export of projects on current Electron.
- **Web page:** HTTP basic-auth password; per-IP rate limit (protects the paid what3words quota); the API key stays on the server; clipboard fallback for iPhone Safari on plain http.

### 2.12 Irrigation checks (feasibility, not yet implemented)

The best signal for crop water stress is thermal imaging (canopy temperature), which the Atom 2 lacks. RGB-based checks that fit the current pipeline:

1. **Wet/dry soil map:** remove plants with the existing Excess Green mask; classify the remaining soil pixels by brightness and colour (wet soil is darker); measure how far water spreads from each drip line; flag dry gaps (possible blocked drippers) and dark standing-water areas (over-watering or poor drainage).
2. **Irrigation-aligned stress:** test whether low-index strips run parallel to the drip lines or line up with irrigation zones, using the existing row-direction code.
3. **Change over time:** compare index maps from repeat scans. The 3D-matched orthomosaics line up well enough between flights to compare area by area.
4. **Rainfall context:** recent rainfall for the field from a free weather API (e.g. Open-Meteo; CHIRPS for research use), to separate irrigation faults from weather.
5. **Optional satellite layer:** Sentinel-1 or Sentinel-2 irrigation and moisture products for whole-farm context.

Cannot be done with RGB alone: measuring soil moisture, or detecting water stress before it is visible. These need thermal cameras or soil sensors.

### 2.13 Testing

- **61 automated tests** (`npm test`), covering: what3words parsing, errors and caching; waypoint conversion and the web API; the Eve mission format and limits; adb commands (with a fake adb); path planning with no-fly zones; vegetation indices and problem areas; the weed model on two real labelled photos against the experts' labels; the field health summary; orthomosaic tiling, no-data handling and OpenDroneMap arguments; and full end-to-end workflows on GPS-tagged photos.
- **In-app tests:** Electron windows driven by scripts, with screenshots: set up a field from what3words, import, analyse, switch layers, reload.
- **Structure from motion:** full OpenDroneMap runs through the app's own code on 40 overlapping field photos (see section 2.5).
- **Reproducible evaluation tools** (`tools/`): `fetch_remote_zip.py` (download parts of the weed dataset), `weeddb_to_sd_card.js` (turn it into GPS-tagged JPEGs), `export_weed_features.js`, `train_weed_model.py`, `eval_weed_model.js`, and `compare_problem_areas/`.

Not yet tested: a real Atom 2 flight, a real phone, and a live what3words key.

---

## Credits and licences

- Eve mission format: reverse-engineered by the HOT Drone Tasking Manager team.
- OpenDroneMap (AGPL): run as a separate Docker container, not bundled.
- Canopeo canopy rule: Patrignani & Ochsner (2015), Agronomy Journal 107(6):2312–2320.
- Basemap imagery: Esri, Maxar, Earthstar Geographics.
- what3words is a trademark of what3words Ltd. This project is not affiliated with what3words or Potensic.
- Licence: MIT (see [LICENSE](LICENSE)).

## Older project is CoFly

Eagle Eye grew out of **CoFly-GUI** ([github.com/ElsevierSoftwareX/SOFTX-D-23-00036](https://github.com/ElsevierSoftwareX/SOFTX-D-23-00036)), © IKH Innovation / CoFly team, MIT licence. CoFly was a desktop app for DJI Phantom 4 Pro field scans. From it, Eagle Eye keeps the desktop-app structure, the four RGB index formulas and the display-range rule. Eagle Eye replaced CoFly's DJI radio link, path-planner projection (which swapped latitude and longitude), k-means problem-area grouping (the "earlier implementation" in section 2.7) and Windows-only tools.

The weed training data is **CoFly-WeedDB**: Krestenitis et al. (2022), *Data in Brief* 45, 108575, doi:[10.1016/j.dib.2022.108575](https://doi.org/10.1016/j.dib.2022.108575), CC-BY-4.0. The "published U-Net" in section 2.8 is CoFly's Weed-Detection model, whose trained weights were never released. CoFly's original README is kept in [docs/COFLY_ORIGINAL_README.md](docs/COFLY_ORIGINAL_README.md).
