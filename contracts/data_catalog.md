# Catalog Contract

`sites.json` records permanent snake_case `id`, display name, category, agency/program, `latitude_deg`, `longitude_deg_east`, coordinate frame, source URL/type, verification status, tier, and notes. Landing records may include `landing_coords`, optional `target_coords`, `coord_note`, `touchdown_utc`, `touchdown_precision`, and optional `last_contact_utc`.

Only authoritative-source rows may be marked verified. Historical coordinates drive computation; target coordinates are secondary pins. `sparklines.bin` uses the shared binary-sidecar contract.
