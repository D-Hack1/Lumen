"""Reproducible G7 Chandrayaan-3 touchdown Sun-elevation check."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml

from lumen_pipeline.catalog.build_catalog import default_sites_path
from lumen_pipeline.common.timeutil import et_to_utc, utc_to_et
from lumen_pipeline.ephem.kernels import loaded_kernels
from lumen_pipeline.reference.events import detect_events
from lumen_pipeline.reference.interp import Ephemeris
from lumen_pipeline.validation.golden import default_ephemeris_path

SITE_ID = "cy3_shiv_shakti"
REFERENCE_ELEVATION_DEG = 8.75
TOLERANCE_DEG = 0.25
OPS_ELEVATION_DEG = 6.0
SHUTDOWN_WINDOW_START_UTC = "2023-09-02T00:00:00Z"
SHUTDOWN_WINDOW_END_UTC = "2023-09-05T00:00:00Z"


def default_output_path() -> Path:
    """Return the standalone G7 report path."""
    return Path(__file__).resolve().parents[2] / "reports" / "g7_cy3.json"


def _report_path(path: Path) -> str:
    root = Path(__file__).resolve().parents[3]
    try:
        return path.resolve().relative_to(root).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def build_g7_report(
    ephemeris_path: str | Path | None = None,
    sites_path: str | Path | None = None,
) -> dict[str, Any]:
    """Evaluate the plan's documented G7 reference using the locked ephemeris."""
    ephem_path = Path(ephemeris_path) if ephemeris_path is not None else default_ephemeris_path()
    site_path = Path(sites_path) if sites_path is not None else default_sites_path()
    site_rows = yaml.safe_load(site_path.read_text(encoding="utf-8"))["sites"]
    site = next((row for row in site_rows if row["id"] == SITE_ID), None)
    if site is None:
        raise ValueError(f"G7 site {SITE_ID!r} is missing from {site_path}")
    if site.get("touchdown_precision") != "minute":
        raise ValueError("G7 touchdown reference must retain its documented minute precision")
    landing = site.get("landing_coords")
    if landing is None:
        raise ValueError("G7 requires published landing coordinates, not target coordinates")

    metadata_path = ephem_path.with_suffix(".json")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    ephem_hash = hashlib.sha256(ephem_path.read_bytes()).hexdigest()
    ephem_hash_matches = ephem_hash == metadata.get("sha256")
    ephemeris = Ephemeris.from_file(ephem_path)
    touchdown_utc = site["touchdown_utc"]
    latitude = float(landing["latitude_deg"])
    longitude = float(landing["longitude_deg_east"])

    with loaded_kernels() as kernel_paths:
        kernel_provenance = [
            {"filename": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in kernel_paths
        ]
        ephem_kernel_provenance = metadata.get("kernel_provenance", [])
        kernel_hashes_match = kernel_provenance == ephem_kernel_provenance
        touchdown_et = utc_to_et(touchdown_utc)
        sun = ephemeris.body_at("sun", touchdown_et, latitude, longitude, 0.0)
        shutdown_start_et = utc_to_et(SHUTDOWN_WINDOW_START_UTC)
        shutdown_end_et = utc_to_et(SHUTDOWN_WINDOW_END_UTC)
        timeline_events = detect_events(
            shutdown_start_et,
            shutdown_end_et,
            lambda et: ephemeris.body_at("sun", et, latitude, longitude, 0.0).elevation_deg
            >= OPS_ELEVATION_DEG,
            down="sun_below_ops",
            up="sun_above_ops",
        )
        below_ops_event = next((event for event in timeline_events if event.type == "sun_below_ops"), None)
        timeline_pass = below_ops_event is not None
        below_ops_utc = (
            et_to_utc(below_ops_event.et, precision=0) if below_ops_event is not None else None
        )

    absolute_error = abs(sun.elevation_deg - REFERENCE_ELEVATION_DEG)
    numerical_pass = absolute_error <= TOLERANCE_DEG
    provenance_pass = ephem_hash_matches and kernel_hashes_match
    numerical_failures = [] if numerical_pass else ["touchdown_elevation_outside_tolerance"]
    provenance_failures = []
    if not ephem_hash_matches:
        provenance_failures.append("ephemeris_sha256_mismatch")
    if not kernel_hashes_match:
        provenance_failures.append("kernel_sha256_mismatch")
    timeline_failures = [] if timeline_pass else ["sun_below_ops_event_not_found"]
    status = "PASS" if numerical_pass and timeline_pass else "FAIL"
    return {
        "id": "G7",
        "check": "CY-3 Sun elevation at touchdown",
        "status": status,
        "timestamp_utc": touchdown_utc,
        "timestamp_precision": site["touchdown_precision"],
        "coordinates": {
            "latitude_deg": latitude,
            "longitude_deg_east": longitude,
            "source": landing["source"],
            "source_url": site["source_url"],
            "coordinate_frame": metadata["spice_frame"],
            "height_m": 0.0,
        },
        "ephemeris": {
            "path": _report_path(ephem_path),
            "sha256": ephem_hash,
            "sidecar_path": _report_path(metadata_path),
            "start_et_tdb": metadata["start_et_tdb"],
            "aberration_correction": metadata["aberration_correction"],
            "interpolation": "cubic Hermite",
            "ephemeris_hash_matches_sidecar": ephem_hash_matches,
            "kernel_provenance": ephem_kernel_provenance,
            "loaded_kernel_provenance": kernel_provenance,
            "kernel_hashes_match_sidecar": kernel_hashes_match,
        },
        "computed": {
            "sun_elevation_deg": sun.elevation_deg,
            "sun_azimuth_deg": sun.azimuth_deg,
            "et_seconds": touchdown_et,
        },
        "reference": {
            "sun_elevation_deg": REFERENCE_ELEVATION_DEG,
            "source": "PLAN_FINAL_R3_DELTA.md, D-13 G7 (mission-team value)",
            "primary_source_status": "UNVERIFIED: primary citation is not recorded in the repository",
            "tolerance_deg": TOLERANCE_DEG,
        },
        "absolute_error_deg": absolute_error,
        "numerical_result": "PASS" if numerical_pass else "FAIL",
        "provenance_result": "PASS" if provenance_pass else "FAIL",
        "failure_reasons": {
            "numerical": numerical_failures,
            "provenance": provenance_failures,
            "timeline": timeline_failures,
        },
        "qualitative_timeline_check": {
            "status": "PASS" if timeline_pass else "FAIL",
            "sun_below_6_deg_utc": below_ops_utc,
            "expected_window_start_utc": SHUTDOWN_WINDOW_START_UTC,
            "expected_window_end_exclusive_utc": SHUTDOWN_WINDOW_END_UTC,
            "criterion": "The 6-degree crossing falls within the reported 2-4 September shutdown dates.",
        },
    }


def write_g7_report(
    output_path: str | Path | None = None,
    ephemeris_path: str | Path | None = None,
    sites_path: str | Path | None = None,
) -> dict[str, Any]:
    """Write and return the deterministic G7 report."""
    destination = Path(output_path) if output_path is not None else default_output_path()
    report = build_g7_report(ephemeris_path, sites_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(write_g7_report(), sort_keys=True))
