# Eagle Eye: research background and original prompt

The literature review behind Eagle Eye (10 drone and 5 satellite imagery papers) and the prompt that started the project. The main project description is in the [README](../README.md).

## Original prompt

> research 10 papers on using imagery specifically from drones and five research papers that uses images from satellites that have been used to detect the welfare and prosperity of farmers fields from rain, weeds, irrigation, fertilization, pests, and runoff. using the open source project here: https://github.com/ElsevierSoftwareX/SOFTX-D-23-00036, improve on the project to integrate what3words to the waypoint system. also edit the code so that it works for potensic atom 2 and the new upgraded waypoint system. for all the code improvements, create a github repo.
> when a user puts in a specific what3words coordinate, the protensic atom 2 drone can directly to that area and take a photo.
> put all your research findings and this prompt into a read.md file

Follow-up requests made while planning:

- Add a phone-friendly web page, so the what3words lookup works in the field without a laptop.
- Make the app work only with the Potensic Atom 2: remove the other drone (DJI), and make every image-analysis and weed feature work with Atom 2 photos.
- Make the what3words feature easy to find (it now has its own tile on the home screen).
- Compare CoFly's own detection models (Weed-Detection, Problematic-Areas-Detection) with the ones written here, and use whichever is better.
- **Create project** from four what3words corners of the field instead of drawing it. The drone photographs the whole field in smaller pictures at a chosen height. Every photo is analysed for crop health and weeds, then the photos, crop-health maps and weed map are stitched into maps of the field.
- Test the crop-health and weed maps on the Greek cotton data linked from the original repo.
- Keep the single what3words photo flight, and analyse that one photo for crop health and weeds.
- Test what3words with hardcoded sample addresses: one at Donnelly Field (Cambridge, MA) and three around it.
- Rename the project **Eagle Eye** everywhere, and add the new logo.
- Add a summary for the farmer: **one number for crop health and one for weeds**, as a section after the field maps.
- Rewrite the descriptions of Load project and Create project, and rename "Fly to what3words" to **Fly to one spot**.
- Remove the "test samples" notices from Create project and Fly to one spot.
- In the web app, convert the Donnelly Field what3words into coordinates that can be entered as waypoints in the Potensic Eve iOS app, which doesn't support what3words.

---

## Research findings

Every paper below was checked against its DOI record (Crossref) for title, authors, year, journal, volume and pages. Abstract details come from the publisher, OpenAlex or the repository records. Two entries are marked † because their abstract details came from secondary indexes, not the publisher's full text.

### Drone (UAV) imagery: 10 papers

| # | Paper | Factor | Drone & sensor | Method | Key finding |
|---|---|---|---|---|---|
| D1 | Huang et al. (2018). *A fully convolutional network for weed mapping of UAV imagery.* PLOS ONE 13(4) e0196302. [doi](https://doi.org/10.1371/journal.pone.0196302) | Weeds | UAV, **RGB**; rice, South China | Fully convolutional network (FCN) with transfer learning and skip connections, compared with patch- and pixel-based CNNs | Beat both baselines: overall accuracy 0.935, weed recognition 0.883 |
| D2 | Bah, Hafiane & Canals (2018). *Deep learning with unsupervised data labeling for weed detection in line crops in UAV images.* Remote Sensing 10(11) 1690. [doi](https://doi.org/10.3390/rs10111690) | Weeds | UAV, **RGB**; spinach, bean | Crop rows detected automatically, so weeds between rows label themselves; then a CNN | Self-labelled training data came within 1.5% (spinach) and 6% (bean) of expert-labelled accuracy |
| D3 | Krestenitis et al. (2022). *CoFly-WeedDB: A UAV image dataset for weed detection and species identification.* Data in Brief 45, 108575. [doi](https://doi.org/10.1016/j.dib.2022.108575) | Weeds | DJI Phantom 4 Pro **RGB**, 5 m altitude, −87° gimbal; cotton, Larissa, Greece | 201 expert-annotated images (1280×720) | Open benchmark for 3 weed species early in the season; made by the same team as CoFly |
| D4 | Hoffmann et al. (2016). *Crop water stress maps for an entire growing season from visible and thermal UAV imagery.* Biogeosciences 13, 6545–6563. [doi](https://doi.org/10.5194/bg-13-6545-2016) | Irrigation / water stress | UAV, thermal + RGB; barley | Water Deficit Index from surface temperature plus the RGB greenness index NGRDI; 0.25 m maps | Matched stress measured by an eddy-covariance flux tower (a ground station measuring crop water loss); shows where irrigation is needed |
| D5 | Gago et al. (2015). *UAVs challenge to assess water stress for sustainable agriculture.* Agricultural Water Management 153, 9–19. [doi](https://doi.org/10.1016/j.agwat.2015.01.020) † | Irrigation / drought | Review: multispectral, thermal, fluorescence sensors | Review checked against plant-physiology measurements | NDVI, TCARI/OSAVI and PRI track water status, but the best index depends on the crop; thermal imaging maps patchy stress |
| D6 | Maresma et al. (2016). *Analysis of vegetation indices to determine nitrogen application and yield prediction in maize from a standard UAV service.* Remote Sensing 8(12) 973. [doi](https://doi.org/10.3390/rs8120973) | Fertilization (N), yield | Commercial UAV, compact multispectral camera | Indices across 0–400 kg N/ha plots | WDRVI explained yield best. At the economic optimum (≈240 kg N/ha) indices stopped responding to extra N, so they can predict yield by mid-season (V12) |
| D7 | Su et al. (2018). *Wheat yellow rust monitoring by learning from multispectral UAV aerial imagery.* Computers and Electronics in Agriculture 155, 157–166. [doi](https://doi.org/10.1016/j.compag.2018.10.017) | Pests & disease | UAV, MicaSense RedEdge 5-band camera, 1–1.5 cm/pixel | Random forest on vegetation indices | ≈89% accuracy 45 days after infection; RVI, NDVI and OSAVI worked best |
| D8 | Tetila et al. (2020). *Detection and classification of soybean pests using deep learning with UAV images.* Computers and Electronics in Agriculture 179, 105836. [doi](https://doi.org/10.1016/j.compag.2020.105836) † | Pests | UAV, **RGB** soybean field images (≈5,000) | Five CNNs, fine-tuned or with transfer learning | Up to 93.8% accuracy; beat classic feature-based methods |
| D9 | d'Oleire-Oltmanns et al. (2012). *Unmanned aerial vehicle (UAV) for monitoring soil erosion in Morocco.* Remote Sensing 4(11), 3390–3416. [doi](https://doi.org/10.3390/rs4113390) | Runoff & erosion | Fixed-wing UAV, consumer **RGB** camera | Photogrammetry producing terrain models (DTMs) and orthomosaics | Sub-decimetre terrain models measured gully erosion in 3D, at a scale between field surveys and satellites |
| D10 | Liu et al. (2018). *Estimates of rice lodging using indices derived from UAV visible and thermal infrared images.* Agricultural and Forest Meteorology 252, 144–154. [doi](https://doi.org/10.1016/j.agrformet.2018.01.021) | Rain / storm damage (lodging) | UAV, RGB + thermal | Colour, texture and temperature features with a support-vector machine (SVM) | Lodged rice detected with under 10% error; adding thermal improved accuracy |

### Satellite imagery: 5 papers

| # | Paper | Factor | Satellite & sensor | Method | Key finding |
|---|---|---|---|---|---|
| S1 | Jean et al. (2016). *Combining satellite imagery and machine learning to predict poverty.* Science 353(6301), 790–794. [doi](https://doi.org/10.1126/science.aaf7894) | **Farmer welfare & prosperity** | High-res daytime imagery + night-lights; 5 African countries | CNN learns from night-lights, then predicts survey results | Explains up to 75% of the variation in local consumption and assets |
| S2 | Burke & Lobell (2017). *Satellite-based assessment of yield variation and its determinants in smallholder African systems.* PNAS 114(9), 2189–2194. [doi](https://doi.org/10.1073/pnas.1616919114) | Yield / prosperity; fertilizer | 1 m satellite imagery; thousands of maize fields, Kenya | Satellite yield estimates compared with field and survey data | R² ≈ 0.4 with field yields; picks up the same fertilizer and hybrid-seed gains as surveys |
| S3 | Funk et al. (2015). *The climate hazards infrared precipitation with stations (CHIRPS).* Scientific Data 2, 150066. [doi](https://doi.org/10.1038/sdata.2015.66) | **Rain / drought** | Satellite infrared blended with rain-gauge stations, 0.05° | Climatology + station blending | Free near-global rainfall record since 1981; standard tool for drought early warning |
| S4 | Bazzi et al. (2019). *Mapping irrigated areas using Sentinel-1 time series in Catalonia, Spain.* Remote Sensing 11(15), 1836. [doi](https://doi.org/10.3390/rs11151836) | **Irrigation** (vs. rain) | Sentinel-1 radar (SAR); Sentinel-2 NDVI for comparison | Plot-level vs. regional radar signal separates irrigation from rainfall; random forest and CNN | 94.1% accuracy with a CNN on Sentinel-1 |
| S5 | Delloye, Weiss & Defourny (2018). *Retrieval of the canopy chlorophyll content from Sentinel-2 spectral bands to estimate nitrogen uptake in intensive winter wheat cropping systems.* Remote Sensing of Environment 216, 245–261. [doi](https://doi.org/10.1016/j.rse.2018.06.037) | **Fertilization (N)** | Sentinel-2 (10 m + red-edge bands); farmers' wheat fields | Neural-network chlorophyll retrieval → nitrogen status | R² = 0.90 vs. canopy nitrogen; errors ≈ 4–21 kg N/ha |

### What the research says, by factor

| Factor | Summary |
|---|---|
| **Rain** | Satellites (S3, CHIRPS) are the standard way to flag rain shortfalls and excess anywhere on Earth. In the field, storm damage shows up as lodged (flattened) crops, which drone imagery measures well (D10). Telling rain apart from irrigation is a known challenge for radar too (S4). |
| **Weeds** | This is where cheap RGB drones are strongest. D1, D2 and D3 detect weeds from ordinary colour photos. Satellite pixels are too coarse to see individual weeds. |
| **Irrigation** | The best field-scale water-stress signal is thermal (D4, D5). From space, radar maps *which* fields are irrigated with 90–94% accuracy (S4). Satellites show where water goes; drones show which plants are stressed. |
| **Fertilization** | Nitrogen status shows in vegetation indices from both drones (D6) and Sentinel-2 (S5). Satellite yield maps pick up the payoff from fertilizer (S2). |
| **Pests & disease** | Multispectral drones catch yellow rust at ≈89% (D7). Close-range RGB plus deep learning classifies soybean pests at up to 94% (D8). |
| **Runoff & erosion** | Overlapping RGB drone photos can be turned into 3D terrain models that measure gullies and soil loss (D9). |
| **Welfare & prosperity** | Satellite imagery predicts household consumption and assets (S1) and smallholder yields (S2). This links field condition to farmers' livelihoods. |

### What this means for a what3words + Atom 2 workflow

- **The Atom 2 camera is RGB only** (no near-infrared or thermal). Use RGB indices such as ExG, VARI, NGRDI or GLI. NGRDI is already part of D4's water-stress index. Compare against a nearby reference square or an earlier visit rather than reading absolute values.
- **Weeds, pests and visible damage are the best uses.** D1, D2, D3, D8, D9 and D10 all work with RGB. A low, straight-down photo (−90° gimbal, as in D3) of a single 3 m square matches those studies' setups.
- **Satellites flag, the drone checks.** Free satellite layers point to a problem area:
  - rainfall anomalies (S3)
  - Sentinel-2 vigour or nitrogen (S5)
  - irrigation status (S4)
  - poverty or yield maps (S1, S2)

  A what3words address gives a precise, easy-to-share name for that square, and the Atom 2 flies there for a close-up photo. This is the same "zoom-in follow-up" idea as CoFly's Hot-Point missions.
- **Know the limits.** Early water stress (thermal), early disease (near-infrared/red-edge) and quantitative nitrogen levels (multispectral) can't be measured reliably from RGB alone. Treat RGB results as "check on the ground", not a diagnosis. Keep height, camera angle and time of day the same between visits.

### References

- Bah, M. D., Hafiane, A., & Canals, R. (2018). Deep learning with unsupervised data labeling for weed detection in line crops in UAV images. *Remote Sensing, 10*(11), 1690. https://doi.org/10.3390/rs10111690
- Bazzi, H., Baghdadi, N., Ienco, D., El Hajj, M., Zribi, M., et al. (2019). Mapping irrigated areas using Sentinel-1 time series in Catalonia, Spain. *Remote Sensing, 11*(15), 1836. https://doi.org/10.3390/rs11151836
- Burke, M., & Lobell, D. B. (2017). Satellite-based assessment of yield variation and its determinants in smallholder African systems. *PNAS, 114*(9), 2189–2194. https://doi.org/10.1073/pnas.1616919114
- Delloye, C., Weiss, M., & Defourny, P. (2018). Retrieval of the canopy chlorophyll content from Sentinel-2 spectral bands to estimate nitrogen uptake in intensive winter wheat cropping systems. *Remote Sensing of Environment, 216*, 245–261. https://doi.org/10.1016/j.rse.2018.06.037
- d'Oleire-Oltmanns, S., Marzolff, I., Peter, K. D., & Ries, J. B. (2012). Unmanned aerial vehicle (UAV) for monitoring soil erosion in Morocco. *Remote Sensing, 4*(11), 3390–3416. https://doi.org/10.3390/rs4113390
- Funk, C., Peterson, P., Landsfeld, M., Pedreros, D., Verdin, J., et al. (2015). The climate hazards infrared precipitation with stations—a new environmental record for monitoring extremes. *Scientific Data, 2*, 150066. https://doi.org/10.1038/sdata.2015.66
- Gago, J., Douthe, C., Coopman, R. E., Gallego, P. P., Ribas-Carbo, M., et al. (2015). UAVs challenge to assess water stress for sustainable agriculture. *Agricultural Water Management, 153*, 9–19. https://doi.org/10.1016/j.agwat.2015.01.020
- Hoffmann, H., Jensen, R., Thomsen, A., Nieto, H., et al. (2016). Crop water stress maps for an entire growing season from visible and thermal UAV imagery. *Biogeosciences, 13*(24), 6545–6563. https://doi.org/10.5194/bg-13-6545-2016
- Huang, H., Deng, J., Lan, Y., Yang, A., et al. (2018). A fully convolutional network for weed mapping of unmanned aerial vehicle (UAV) imagery. *PLOS ONE, 13*(4), e0196302. https://doi.org/10.1371/journal.pone.0196302
- Jean, N., Burke, M., Xie, M., Davis, W. M., Lobell, D. B., & Ermon, S. (2016). Combining satellite imagery and machine learning to predict poverty. *Science, 353*(6301), 790–794. https://doi.org/10.1126/science.aaf7894
- Krestenitis, M., Raptis, E. K., Kapoutsis, A. Ch., Ioannidis, K., et al. (2022). CoFly-WeedDB: A UAV image dataset for weed detection and species identification. *Data in Brief, 45*, 108575. https://doi.org/10.1016/j.dib.2022.108575
- Liu, T., Li, R., Zhong, X., Jiang, M., et al. (2018). Estimates of rice lodging using indices derived from UAV visible and thermal infrared images. *Agricultural and Forest Meteorology, 252*, 144–154. https://doi.org/10.1016/j.agrformet.2018.01.021
- Maresma, Á., Ariza, M., Martínez, E., Lloveras, J., et al. (2016). Analysis of vegetation indices to determine nitrogen application and yield prediction in maize (*Zea mays* L.) from a standard UAV service. *Remote Sensing, 8*(12), 973. https://doi.org/10.3390/rs8120973
- Su, J., Liu, C., Coombes, M., Hu, X., et al. (2018). Wheat yellow rust monitoring by learning from multispectral UAV aerial imagery. *Computers and Electronics in Agriculture, 155*, 157–166. https://doi.org/10.1016/j.compag.2018.10.017
- Tetila, E. C., Machado, B. B., Astolfi, G., Belete, N. A. de S., et al. (2020). Detection and classification of soybean pests using deep learning with UAV images. *Computers and Electronics in Agriculture, 179*, 105836. https://doi.org/10.1016/j.compag.2020.105836
