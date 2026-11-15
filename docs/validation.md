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

## Aggregate G0-G11 report

`web/public/data/validation/report.json` is generated offline by
`lumen_pipeline.validation.report.write_validation_report()`. It only marks a gate PASS
when its required measured evidence artifact is available. In particular, G5 remains
BLOCKED without independent PGDA map-pixel references, G10 remains BLOCKED without terrain
Monte Carlo sigma and Tier-B calibration artifacts, and G7 remains SOURCE UNVERIFIED despite
its numerical PASS. The report also records the R3 near-zone terrain inconsistency as OPEN:
the terrain near-zone helper clamps a negative distant DEM horizon although R3 D-9 says not
to clamp `m_dem` itself.
