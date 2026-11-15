# data_sources_ephem.md

_Owner: Gowri_

Kernel and ephemeris data citations.

## G7 Chandrayaan-3 source review

The planned G7 reference value, 8.75 +/- 0.25 degrees at landing, is retained from
`PLAN_FINAL_R3_DELTA.md` D-13 solely as a planned numerical comparison. It is not cited as
an ISRO or primary-mission result because no source establishing the value was found.

| Source reviewed | Publication date | Relevant section | Exact quoted claim | Result |
|---|---|---|---|---|
| [ISRO, "Chandrayaan-3"](https://www.isro.gov.in/Chandrayaan3.html) | Not stated; mission updates shown from 2023-07-06 to 2023-09-22 | August 23, 2023 | "Chandrayaan-3 has successfully soft-landed on the moon." | Does not state 8.75 degrees, +/-0.25 degrees, or a limb convention. |
| [ISRO, "Chandrayaan-3 Details"](https://www.isro.gov.in/Chandrayaan3_Details.html) | Not stated | Overall specifications, Landing Site (Prime) | "4 km x 2.4 km 69.367621 S, 32.348126 E" | Pre-landing target, not the G7 landing coordinate; no Sun-elevation claim. |

The calculation assumptions are traceable in the G7 JSON report. Its implementation uses
2023-08-23T12:33:00Z, 69.373 degrees S, 32.319 degrees E, 0 m, `MOON_ME_DE421`, and the
Sun-centre topocentric direction. The published reference's time precision, landing fix,
and Sun-centre versus upper-limb convention remain source-unverified.
