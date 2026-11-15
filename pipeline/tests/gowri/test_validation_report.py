import json
import math

from lumen_pipeline.validation.frame_check import default_output_path as default_g1_evidence_path
from lumen_pipeline.validation.horizons_client import (
    AZIMUTH_TOLERANCE_DEG,
    DSN_ELEVATION_TOLERANCE_DEG,
    ELEVATION_TOLERANCE_DEG,
    RANGE_TOLERANCE_KM,
)
from lumen_pipeline.validation.report import build_validation_report, write_validation_report


def _gate(report, identifier):
    return next(gate for gate in report["gates"] if gate["id"] == identifier)


def test_validation_report_uses_actual_horizons_and_g7_evidence(tmp_path):
    report = write_validation_report(tmp_path / "report.json")
    repeated_path = tmp_path / "report-repeated.json"
    write_validation_report(repeated_path)

    assert json.loads((tmp_path / "report.json").read_text(encoding="utf-8")) == report
    assert (tmp_path / "report.json").read_bytes() == repeated_path.read_bytes()
    assert report["status"] == "NOT_READY"
    g1 = _gate(report, "G1")
    assert g1["status"] == "PASS"
    assert g1["value"]["max_matrix_error"] < g1["tolerances"]["matrix_max_abs_error"]
    assert g1["value"]["max_direction_error_rad"] < g1["tolerances"]["direction_max_angular_error_rad"]
    evidence = json.loads(default_g1_evidence_path().read_text(encoding="utf-8"))
    assert g1["value"] == evidence["metrics"]
    assert g1["epochs_utc"] == evidence["epochs_utc"]
    assert g1["frames"] == evidence["frames"]
    assert g1["provenance"]["kernels"] == evidence["kernels"]
    g3 = _gate(report, "G3")
    assert g3["status"] == "PASS"
    assert g3["tolerances"] == {
        "elevation_deg": ELEVATION_TOLERANCE_DEG,
        "azimuth_deg": AZIMUTH_TOLERANCE_DEG,
        "earth_range_km": RANGE_TOLERANCE_KM,
    }
    assert g3["value"]["comparison_count"] == 200
    assert g3["value"]["max_elevation_error_deg"] < ELEVATION_TOLERANCE_DEG
    assert g3["value"]["max_azimuth_error_deg"] < AZIMUTH_TOLERANCE_DEG
    assert g3["value"]["max_earth_range_error_km"] < RANGE_TOLERANCE_KM
    g3b = _gate(report, "G3b")
    assert g3b["status"] == "PASS"
    assert g3b["value"]["comparison_count"] == 45
    moon_elevation_error = g3b["value"]["max_moon_elevation_error_deg"]
    assert math.isfinite(moon_elevation_error)
    assert 0.0 <= moon_elevation_error < DSN_ELEVATION_TOLERANCE_DEG
    g7 = _gate(report, "G7")
    assert g7["status"] == "SOURCE_UNVERIFIED"
    assert g7["numerical_result"] == "PASS"
    assert g7["calculation_status"] == "PASS"


def test_validation_report_truthfully_aggregates_pending_blocked_and_open_evidence():
    report = build_validation_report()

    assert report["gate_count"] == 13
    assert {gate["status"] for gate in report["gates"]} <= {
        "PASS",
        "PENDING",
        "BLOCKED",
        "SOURCE_UNVERIFIED",
    }
    assert _gate(report, "G5")["status"] == "BLOCKED"
    assert _gate(report, "G10")["status"] == "BLOCKED"
    assert _gate(report, "G4")["status"] == "PENDING"
    assert _gate(report, "G11")["status"] == "PENDING"
    assert report["open_issues"][0]["status"] == "OPEN"
    assert "R3-NEAR-ZONE-TERRAIN-INCONSISTENCY" == report["open_issues"][0]["id"]
    assert report["status"] == "NOT_READY"


def test_validation_report_marks_missing_evidence_blocked_or_pending(tmp_path):
    missing = tmp_path / "missing"
    report = build_validation_report(
        fixtures_dir=missing,
        g7_report_path=missing / "g7.json",
        validation_doc_path=missing / "validation.md",
        g1_report_path=missing / "g1.json",
    )

    assert _gate(report, "G1")["status"] == "BLOCKED"
    assert _gate(report, "G2")["status"] == "PENDING"
    assert _gate(report, "G3")["status"] == "BLOCKED"
    assert _gate(report, "G3b")["status"] == "BLOCKED"
    assert _gate(report, "G7")["status"] == "BLOCKED"
    assert report["status"] == "NOT_READY"
