# DSN Contract

`dsn.bin` stores geometric Moon-centre elevation for DSS-14, DSS-43, and DSS-63 from 2023 through 2030 at 600-second cadence. It is not a link budget or signal-margin product.

Values are quantised to 0.5 degrees in uint8 using the sidecar scale and offset, spanning -90 to +90 degrees. The sidecar identifies station order, frame/kernel provenance, cadence, geometric-only mode, and standard binary metadata.
