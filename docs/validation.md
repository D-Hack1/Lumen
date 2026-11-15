# validation.md

_Owner: Gowri_

Human-readable gate results, scope statement.

## G2 - Hourly ephemeris Hermite validation

- Epochs: 10000 (deterministic seed 421)
- Sun maximum direction residual: 0.000006502 deg
- Earth maximum direction residual: 0.000002091 deg
- Gate: PASS (< 0.001 deg; measured 0.000006502 deg)

## G7 - Chandrayaan-3 touchdown Sun elevation

- Calculation input: 2023-08-23T12:33:00Z (minute precision), 69.373 degrees S,
  32.319 degrees E, 0 m on the spherical lunar surface.
- Calculation geometry: LT+S apparent Moon-centred Sun vector minus the site vector,
  evaluated in `MOON_ME_DE421`; this is a Sun-centre elevation above the local spherical
  horizontal, with no terrain horizon applied.
- Calculated Sun-centre elevation: 8.612140050356778 degrees.
- Planned numerical comparison: 8.75 +/- 0.25 degrees; absolute difference:
  0.13785994964322157 degrees. Numerical result: PASS.
- Source provenance result: SOURCE UNVERIFIED. The R3 plan records the 8.75-degree
  comparison value but does not cite a primary source. Review of the ISRO mission and
  mission-detail pages did not locate a statement of 8.75 degrees, +/-0.25 degrees, or a
  Sun-centre/limb convention. G7 is not a complete independently sourced mission-value
  validation until that document is identified.

## G5 - PGDA map-pixel comparison

- Gate: **BLOCKED**. The local 85S-90S, 60 m PGDA products were sampled at the
  verified Shackleton target (`-89.54`, `129.0°E`): average solar illumination
  `0.0`, Earth visibility `0.0`. These are reference-pixel values only;
  computed LUMEN fractions and errors remain null.
- Both TIFFs are 5058x5058 `int16` rasters in south-polar stereographic
  `Moon2000_spole` coordinates with radius `1737400 m`, 60 m pixels, scale
  `4e-5`, offset `0`, and nodata `-32768`. The longitude-east spherical input
  is transformed into the raster CRS before selecting its containing pixel.
  At Shackleton, the sampled pixel is row 2675, column 2709; its centre is
  15.5847 m from the transformed site coordinate.
- `pipeline/config/dem_sources.yaml` documents hourly averaging over an
  approximately 18.6-year lunar nutation cycle (centred around 2016-08 by the
  product filename), citing Mazarico et al. (2011), DOI
  `10.1016/j.icarus.2010.10.030`. The TIFF `START_TIME`/`STOP_TIME` tags
  describe the underlying LOLA source observations
  (`2009-07-13T17:33:17.246` through `2013-07-18T14:12:13`), not that
  averaging period.
- PGDA defines Earth visibility as any part of the Earth disc above the local
  LOLA-topography horizon. The solar-disc convention and observer-height
  convention are not established in the local product metadata. The available
  Shackleton terrain mask covers heights 1, 2, 5, and 10 m, not 0 m; do not
  equate its 1 m result with the PGDA surface convention.
- G5 also lacks matching LUMEN averages over the PGDA period and a numeric
  interpretation of the plan's “within a few percent” criterion. The local
  TIFFs are Git-ignored; their hashes and relative paths are recorded when
  available, while missing inputs remain BLOCKED. No G5 acceptance is claimed.

## Aggregate G0-G11 report

`web/public/data/validation/report.json` is generated offline by
`lumen_pipeline.validation.report.write_validation_report()`. It only marks a gate PASS
when its required measured evidence artifact is available. In particular, G5 remains
BLOCKED until matching independent LUMEN averages and a numeric comparison criterion are
available, G10 remains BLOCKED without terrain Monte Carlo sigma and Tier-B calibration
artifacts, and G7 remains SOURCE UNVERIFIED despite its numerical PASS. The R3 near-zone
helper now preserves the distant DEM horizon whenever the near-zone contribution is zero,
including negative and unavailable values.
