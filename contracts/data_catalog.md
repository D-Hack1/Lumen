# Catalog Contract

`sites.json` records permanent snake_case `id`, display name, category, agency/program, `latitude_deg`, `longitude_deg_east`, coordinate frame, source URL/type, verification status, tier, and notes. Landing records may include `landing_coords`, optional `target_coords`, `coord_note`, `touchdown_utc`, `touchdown_precision`, and optional `last_contact_utc`.

Only authoritative-source rows may be marked verified. Historical coordinates drive computation; target coordinates are secondary pins.

## Sparklines

`sparklines.bin` uses the shared binary-sidecar contract. It is a C-contiguous `uint8` array with shape `[site, 2, day]`, fields `sunlit_pct` and `link_pct`, and `units: "percent"`; values are integer percentages in `[0, 100]`, not fractions. Required sidecar extras are `sites` (one id per row) and UTC-midnight `start_utc`. `days` repeats the final shape dimension for inspection.

The optional `provenance` mapping records each emitted site as either `smooth-Moon bounds` or `verified site-matched terrain mask`. The optional `excluded_sites` mapping records catalog sites deliberately omitted from the binary, including preliminary Shackleton outputs. These extras are backward-compatible with the shared sidecar reader. Frontend provenance display is not implemented; the current consumer reads only `sites` and `start_utc`.
