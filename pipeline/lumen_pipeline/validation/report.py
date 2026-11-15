"""Build the evidence-backed LUMEN G0-G11 validation report."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from lumen_pipeline.validation.frame_check import DIRECTION_TOLERANCE_RAD, MATRIX_TOLERANCE
from lumen_pipeline.validation.horizons_client import (
    AZIMUTH_TOLERANCE_DEG,
    DSN_ELEVATION_TOLERANCE_DEG,
    ELEVATION_TOLERANCE_DEG,
    RANGE_TOLERANCE_KM,
    SITE_CASES,
    STATIONS,
    assert_g3_tolerances,
    assert_g3b_tolerances,
    default_fixture_dir,
    dsn_fixture_path,
    fixture_path,
    run_g3,
    run_g3b,
)

REPORT_VERSION = 1
G2_TOLERANCE_DEG = 0.001


def default_output_path() -> Path:
    """Return the Gowri-owned validation report consumed by the application."""
    return Path(__file__).resolve().parents[3] / "web" / "public" / "data" / "validation" / "report.json"


def default_g7_report_path() -> Path:
    """Return the checked-in G7 result artifact."""
    return Path(__file__).resolve().parents[2] / "reports" / "g7_cy3.json"


def default_g1_report_path() -> Path:
    """Return the checked-in G1 frame-validation artifact."""
    return Path(__file__).resolve().parents[2] / "reports" / "g1_lunar_frames.json"


def default_validation_doc_path() -> Path:
    """Return the checked-in document containing the G2 measurement."""
    return Path(__file__).resolve().parents[3] / "docs" / "validation.md"


def _relative(path: Path) -> str:
    root = Path(__file__).resolve().parents[3]
    try:
        return path.resolve().relative_to(root).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def _gate(identifier: str, description: str, status: str, **fields: Any) -> dict[str, Any]:
    return {"id": identifier, "description": description, "status": status, **fields}


def _pending_gates() -> list[dict[str, Any]]:
    return [
        _gate(
            "G0",
            "Raycaster on synthetic cone/crater DEM",
            "PENDING",
            criterion="< 0.01 deg",
            reason="No persisted terrain-owner G0 measurement artifact is available to this reporter.",
            artifact_paths=["pipeline/tests/terrain/test_horizon_synthetic.py"],
        ),
        _gate(
            "G4",
            "TypeScript versus Python golden vectors",
            "PENDING",
            criterion="elevation < 0.005 deg; events +/-1 min; dt +/-5%; metrics +/-1%",
            reason="Python synthetic vectors exist, but no browser-engine parity result is available.",
            artifact_paths=["pipeline/tests/gowri/test_golden_synthetic.py"],
        ),
        _gate(
            "G5",
            "Multi-year averages versus independent PGDA map pixels",
            "BLOCKED",
            criterion="within a few percent; differences explained",
            reason="Independent documented PGDA map-pixel references have not been supplied.",
            required_artifacts=["pipeline/data/validation/pgda_reference.json"],
        ),
        _gate(
            "G6",
            "Pad slope versus PGDA slope rasters",
            "PENDING",
            criterion="within a few degrees",
            reason="No independent PGDA slope-raster comparison artifact is available.",
        ),
        _gate(
            "G8",
            "Performance on the demo laptop",
            "PENDING",
            criterion="site <100 ms; slip <16 ms/frame; hover <4 ms; Scan <300 ms; Quick Answer <150 ms",
            reason="No measured demo-laptop performance artifact is available.",
        ),
        _gate(
            "G9",
            "Tier-2 predicted shadows versus LROC image",
            "PENDING",
            criterion="visual agreement",
            reason="Tier-2 shadow prediction and LROC-image comparison have not been produced.",
        ),
        _gate(
            "G10",
            "Tier-B uncertainty calibration against Tier-A event times",
            "BLOCKED",
            criterion="at least about 68 percent inside reported delta-t or inflate sigma",
            reason="Requires Shivha's Monte Carlo sigma artifacts and Tier-B calibration inputs.",
            required_artifacts=["web/public/data/terrain/sigma/", "web/public/data/terrain/tierb/"],
        ),
        _gate(
            "G11",
            "Windows Table, barcode, and CSV integrity",
            "PENDING",
            criterion="100 percent match and CSV round-trip",
            reason="No cross-frontend Windows Table/barcode/CSV round-trip artifact is available.",
        ),
    ]


def _g2_gate(document_path: Path) -> dict[str, Any]:
    if not document_path.exists():
        return _gate(
            "G2",
            "Hourly Hermite interpolation versus direct SpiceyPy",
            "PENDING",
            criterion=f"< {G2_TOLERANCE_DEG} deg across 10,000 epochs",
            reason="The validation document containing the G2 measurement is missing.",
            artifact_paths=[_relative(document_path)],
        )
    text = document_path.read_text(encoding="utf-8")
    match = re.search(
        r"Epochs: (\d+).*?Sun maximum direction residual: ([\d.]+) deg.*?"
        r"Earth maximum direction residual: ([\d.]+) deg",
        text,
        flags=re.DOTALL,
    )
    if match is None:
        return _gate(
            "G2",
            "Hourly Hermite interpolation versus direct SpiceyPy",
            "PENDING",
            criterion=f"< {G2_TOLERANCE_DEG} deg across 10,000 epochs",
            reason="The validation document does not contain a parseable G2 measurement.",
            artifact_paths=[_relative(document_path)],
        )
    epochs, sun, earth = int(match.group(1)), float(match.group(2)), float(match.group(3))
    maximum = max(sun, earth)
    return _gate(
        "G2",
        "Hourly Hermite interpolation versus direct SpiceyPy",
        "PASS" if epochs == 10_000 and maximum < G2_TOLERANCE_DEG else "FAIL",
        criterion=f"< {G2_TOLERANCE_DEG} deg across 10,000 epochs",
        value={"epochs": epochs, "max_sun_direction_error_deg": sun, "max_earth_direction_error_deg": earth},
        artifact_paths=[_relative(document_path)],
        provenance="Recorded deterministic G2 run, seed 421.",
        test_commands=["pytest tests/gowri/test_ephem.py"],
    )


def _fixture_metadata(paths: list[Path]) -> list[dict[str, str]]:
    evidence = []
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        evidence.append(
            {
                "path": _relative(path),
                "source": payload["source"],
                "fetched_utc": payload["fetched_utc"],
            }
        )
    return evidence


def _g3_gate(fixtures_dir: Path) -> dict[str, Any]:
    paths = [fixture_path(site, body, fixtures_dir) for site in SITE_CASES for body in ("sun", "earth")]
    try:
        comparisons = run_g3(fixtures_dir)
        assert_g3_tolerances(comparisons)
        if len(comparisons) != 200:
            raise ValueError(f"expected 200 comparisons, found {len(comparisons)}")
        return _gate(
            "G3",
            "Smooth-sphere topocentric geometry versus NASA/JPL Horizons",
            "PASS",
            criterion="elevation/azimuth < 0.01 deg; Earth range < 1 km",
            value={
                "comparison_count": len(comparisons),
                "max_elevation_error_deg": max(item.elevation_error_deg for item in comparisons),
                "max_azimuth_error_deg": max(item.azimuth_error_deg or 0.0 for item in comparisons),
                "max_earth_range_error_km": max(
                    item.range_error_km for item in comparisons if item.body == "earth"
                ),
            },
            tolerances={
                "elevation_deg": ELEVATION_TOLERANCE_DEG,
                "azimuth_deg": AZIMUTH_TOLERANCE_DEG,
                "earth_range_km": RANGE_TOLERANCE_KM,
            },
            artifact_paths=[_relative(path) for path in paths],
            provenance=_fixture_metadata(paths),
            test_commands=["pytest tests/gowri/test_horizons.py"],
        )
    except (AssertionError, FileNotFoundError, KeyError, ValueError) as error:
        return _gate(
            "G3",
            "Smooth-sphere topocentric geometry versus NASA/JPL Horizons",
            "BLOCKED",
            criterion="elevation/azimuth < 0.01 deg; Earth range < 1 km",
            reason=str(error),
            artifact_paths=[_relative(path) for path in paths],
        )


def _g3b_gate(fixtures_dir: Path) -> dict[str, Any]:
    paths = [dsn_fixture_path(station, fixtures_dir) for station in STATIONS]
    try:
        comparisons = run_g3b(fixtures_dir)
        assert_g3b_tolerances(comparisons)
        if len(comparisons) != 45:
            raise ValueError(f"expected 45 comparisons, found {len(comparisons)}")
        return _gate(
            "G3b",
            "DSS Moon-centre elevation versus NASA/JPL Horizons",
            "PASS",
            criterion="Moon elevation < 0.1 deg",
            value={
                "comparison_count": len(comparisons),
                "max_moon_elevation_error_deg": max(item.elevation_error_deg for item in comparisons),
            },
            tolerances={"moon_elevation_deg": DSN_ELEVATION_TOLERANCE_DEG},
            artifact_paths=[_relative(path) for path in paths],
            provenance=_fixture_metadata(paths),
            test_commands=["pytest tests/gowri/test_horizons.py tests/gowri/test_dsn.py"],
        )
    except (AssertionError, FileNotFoundError, KeyError, ValueError) as error:
        return _gate(
            "G3b",
            "DSS Moon-centre elevation versus NASA/JPL Horizons",
            "BLOCKED",
            criterion="Moon elevation < 0.1 deg",
            reason=str(error),
            artifact_paths=[_relative(path) for path in paths],
        )


def _g7_gate(path: Path) -> dict[str, Any]:
    if not path.exists():
        return _gate(
            "G7",
            "Chandrayaan-3 touchdown Sun elevation and timeline",
            "BLOCKED",
            reason="G7 report artifact is missing.",
            artifact_paths=[_relative(path)],
        )
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
        return _gate(
            "G7",
            "Chandrayaan-3 touchdown Sun elevation and timeline",
            report["source_provenance_result"],
            calculation_status=report["calculation_status"],
            numerical_result=report["numerical_result"],
            source_provenance_result=report["source_provenance_result"],
            value={
                "computed_sun_elevation_deg": report["computed"]["sun_elevation_deg"],
                "reference_sun_elevation_deg": report["reference"]["sun_elevation_deg"],
                "absolute_error_deg": report["absolute_error_deg"],
                "timeline_status": report["qualitative_timeline_check"]["status"],
            },
            tolerances={"sun_elevation_deg": report["reference"]["tolerance_deg"]},
            timestamp_utc=report["timestamp_utc"],
            artifact_paths=[_relative(path)],
            provenance=report["reference"]["source_metadata"],
            test_commands=["pytest tests/gowri/test_g7.py"],
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        return _gate(
            "G7",
            "Chandrayaan-3 touchdown Sun elevation and timeline",
            "BLOCKED",
            reason=f"Invalid G7 report artifact: {error}",
            artifact_paths=[_relative(path)],
        )


def _g1_gate(path: Path) -> dict[str, Any]:
    description = "PA/ME frame transformations versus independent Skyfield reference"
    if not path.exists():
        return _gate("G1", description, "BLOCKED", reason="G1 frame-validation evidence is missing.", artifact_paths=[_relative(path)])
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
        if report["id"] != "G1" or report["schema_version"] != 1:
            raise ValueError("unsupported G1 evidence schema")
        if report["criteria"]["matrix_max_abs_error"] != {"operator": "<", "value": MATRIX_TOLERANCE}:
            raise ValueError("G1 matrix criterion does not match the R3 tolerance")
        if report["criteria"]["direction_max_angular_error_rad"] != {
            "operator": "<",
            "value": DIRECTION_TOLERANCE_RAD,
        }:
            raise ValueError("G1 direction criterion does not match the R3 tolerance")
        if report["reference"]["independent_implementation"] != "Skyfield":
            raise ValueError("G1 evidence lacks the independent Skyfield comparison")
        if report["frames"]["principal_axis"]["name"] != "MOON_PA_DE421":
            raise ValueError("G1 principal-axis frame does not match DE421")
        if (
            report["frames"]["mean_earth"]["name"] != "MOON_ME_DE421"
            or report["frames"]["mean_earth"]["relative_to"] != "MOON_PA_DE421"
        ):
            raise ValueError("G1 mean-Earth frame definition does not match DE421")
        if len(report["epochs_utc"]) < 2:
            raise ValueError("G1 evidence must include multiple UTC epochs")
        if not report["kernels"] or any(len(kernel["sha256"]) != 64 for kernel in report["kernels"]):
            raise ValueError("G1 evidence lacks SHA-256 kernel identifiers")

        metrics = report["metrics"]
        matrix_error = float(metrics["max_matrix_error"])
        direction_error = float(metrics["max_direction_error_rad"])
        orthogonality_error = float(metrics["orthogonality_error_max_abs"])
        minimum_determinant = float(metrics["minimum_determinant"])
        measured_status = (
            "PASS"
            if (
                all(
                    math.isfinite(value) and value >= 0.0
                    for value in (matrix_error, direction_error, orthogonality_error)
                )
                and math.isfinite(minimum_determinant)
                and matrix_error < MATRIX_TOLERANCE
                and direction_error < DIRECTION_TOLERANCE_RAD
                and orthogonality_error <= MATRIX_TOLERANCE
                and minimum_determinant > 0.0
            )
            else "FAIL"
        )
        if report["status"] != measured_status:
            raise ValueError("G1 status does not match its measured residuals")
        return _gate(
            "G1",
            description,
            measured_status,
            criterion="matrix < 1e-9; direction < 1e-6 rad",
            value=metrics,
            tolerances={
                "matrix_max_abs_error": MATRIX_TOLERANCE,
                "direction_max_angular_error_rad": DIRECTION_TOLERANCE_RAD,
                "orthogonality_error_max_abs": MATRIX_TOLERANCE,
                "determinant": "positive",
            },
            epochs_utc=report["epochs_utc"],
            frames=report["frames"],
            provenance={"reference": report["reference"], "kernels": report["kernels"]},
            artifact_paths=[_relative(path)],
            test_commands=[
                "pytest tests/gowri/test_frames_spice.py",
                "python -m lumen_pipeline.validation.frame_check",
            ],
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        return _gate(
            "G1",
            description,
            "BLOCKED",
            reason=f"Invalid G1 report artifact: {error}",
            artifact_paths=[_relative(path)],
        )


def build_validation_report(
    *, fixtures_dir: str | Path | None = None, g7_report_path: str | Path | None = None,
    validation_doc_path: str | Path | None = None, g1_report_path: str | Path | None = None,
) -> dict[str, Any]:
    """Assemble report data from checked-in artifacts without network access."""
    fixture_directory = Path(fixtures_dir) if fixtures_dir is not None else default_fixture_dir()
    g7_path = Path(g7_report_path) if g7_report_path is not None else default_g7_report_path()
    g1_path = Path(g1_report_path) if g1_report_path is not None else default_g1_report_path()
    g2_path = Path(validation_doc_path) if validation_doc_path is not None else default_validation_doc_path()
    gates = _pending_gates() + [
        _g1_gate(g1_path),
        _g2_gate(g2_path),
        _g3_gate(fixture_directory),
        _g3b_gate(fixture_directory),
        _g7_gate(g7_path),
    ]
    gates.sort(key=lambda gate: (int(gate["id"][1:]) if gate["id"] != "G3b" else 3, gate["id"]))
    non_pass = [gate["id"] for gate in gates if gate["status"] != "PASS"]
    return {
        "version": REPORT_VERSION,
        "status": "READY" if not non_pass else "NOT_READY",
        "gate_count": len(gates),
        "non_pass_gates": non_pass,
        "gates": gates,
        "reference_engine_evidence": {
            "scope": "Python reference-engine component tests; this evidence does not establish browser parity or terrain compliance.",
            "test_commands": [
                "pytest tests/gowri/test_uncertainty.py tests/gowri/test_events_guarded.py tests/gowri/test_bounds.py tests/gowri/test_golden_synthetic.py",
                "pytest tests/gowri/test_golden_near_zone_synthetic.py",
            ],
            "coverage": [
                "fast and exact event uncertainty",
                "envelope-guarded sampling and disk-span extrema",
                "ISRO Vikram 6-degree operations preset",
                "three-pass bounds and disk event thresholds",
            ],
        },
        "open_issues": [],
        "limitations": [
            "No gate is promoted to PASS solely because a unit test exists or passes.",
            "G5 requires independent PGDA map-pixel references, not synthetic records.",
            "G7 numerical agreement does not establish the source provenance of the 8.75-degree claim.",
            "G10 requires terrain-owner Monte Carlo sigma and Tier-B calibration artifacts.",
        ],
    }


def write_validation_report(output_path: str | Path | None = None, **kwargs: Any) -> dict[str, Any]:
    """Write the deterministic aggregate report and return its decoded content."""
    path = Path(output_path) if output_path is not None else default_output_path()
    report = build_validation_report(**kwargs)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(write_validation_report(), sort_keys=True))
