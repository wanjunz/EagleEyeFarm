Two photos (resized to 1280x720 JPEG) and their binary weed labels from **CoFly-WeedDB**:
Krestenitis, M. et al. (2022), *Data in Brief* 45, 108575, https://doi.org/10.1016/j.dib.2022.108575.
Dataset: https://doi.org/10.5281/zenodo.6697343, licensed **CC-BY-4.0**. Cotton field, Larissa, Greece, DJI Phantom 4 Pro at ~5 m.

Used by `test/weed_model.test.js` as a regression check. These photos were part of the shipped model's
training data, so the test checks the model still works; accuracy is measured on held-out test splits
(see the README).
