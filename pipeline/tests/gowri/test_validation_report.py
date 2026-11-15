import json
import math

from lumen_pipeline.validation.frame_check import default_output_path as default_g1_evidence_path
from lumen_pipeline.validation.horizons_client import (
    AZIMUTH_TOLERANCE_DEG,
    DSN_ARTIFACT_TOLERANCE_PROPOSAL_DEG,
    DSN_ELEVATION_TOLERANCE_DEG,
    DSN_QUANTIZATION_HALF_STEP_DEG,
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
    artifact = g3b["value"]["decoded_artifact"]
    assert artifact["comparison_count"] == 45
    assert artifact["max_direct_geometry_error_deg"] < DSN_ELEVATION_TOLERANCE_DEG
    assert artifact["max_quantization_error_deg"] <= DSN_QUANTIZATION_HALF_STEP_DEG
    assert artifact["max_decoded_elevation_error_deg"] < DSN_ARTIFACT_TOLERANCE_PROPOSAL_DEG
    assert artifact["status"] == "PROPOSED_NOT_LOCKED"
    g7 = _gate(report, "G7")
    assert g7["status"] == "BLOCKED"
    assert g7["numerical_result"] == "NOT_EVALUATED"
    assert g7["calculation_status"] == "COMPUTED"
    assert "tolerances" not in g7
    assert g7["value"]["unverified_planned_comparison"]["recorded_tolerance_deg"] == 0.25
    assert g7["value"]["im2_touchdown_conditions"]["status"] == "SOURCE_UNVERIFIED"


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
    assert _gate(report, "G4")["status"] == "PASS"
    assert _gate(report, "G11")["status"] == "PASS"
    assert report["open_issues"] == []
    assert report["status"] == "NOT_READY"


def test_validation_report_marks_missing_evidence_blocked_or_pending(tmp_path):
    missing = tmp_path / "missing"
    report = build_validation_report(
        fixtures_dir=missing,
        g7_report_path=missing / "g7.json",
        validation_doc_path=missing / "validation.md",
        g1_report_path=missing / "g1.json",
        g4_report_path=missing / "g4.json",
        g11_report_path=missing / "g11.json",
    )

    assert _gate(report, "G4")["status"] == "PENDING"
    assert _gate(report, "G11")["status"] == "PENDING"
    assert _gate(report, "G1")["status"] == "BLOCKED"
    assert _gate(report, "G2")["status"] == "PENDING"
    assert _gate(report, "G3")["status"] == "BLOCKED"
    assert _gate(report, "G3b")["status"] == "BLOCKED"
    assert _gate(report, "G7")["status"] == "BLOCKED"
    assert report["status"] == "NOT_READY"


def _tamper(source, target, edit):
    import json

    data = json.loads(source.read_text(encoding="utf-8"))
    edit(data)
    target.write_text(json.dumps(data), encoding="utf-8")
    return target


def test_g4_is_not_a_pass_when_a_test_failed_was_skipped_or_the_tolerance_is_looser_than_the_criterion(tmp_path):
    from lumen_pipeline.validation.report import default_g4_report_path

    src = default_g4_report_path()
    failed = _tamper(src, tmp_path / "a.json", lambda d: d["totals"].update(failed=1, passed=d["totals"]["tests"] - 1))
    skipped = _tamper(src, tmp_path / "b.json", lambda d: d["totals"].update(skipped_or_todo=2))
    loose = _tamper(src, tmp_path / "c.json", lambda d: d["golden_sets"]["golden_set1"]["tolerances"].update(elevation_deg=0.05))
    broken = _tamper(src, tmp_path / "d.json", lambda d: d.pop("totals"))
    for path, expected in ((failed, "FAIL"), (skipped, "FAIL"), (loose, "FAIL"), (broken, "BLOCKED")):
        assert _gate(build_validation_report(g4_report_path=path), "G4")["status"] == expected


def test_g11_is_not_a_pass_unless_every_compared_item_matches(tmp_path):
    from lumen_pipeline.validation.report import default_g11_report_path

    src = default_g11_report_path()
    one_window_off = _tamper(src, tmp_path / "a.json", lambda d: d["tally"].update(windowsMatched=d["tally"]["windows"] - 1))
    one_cell_off = _tamper(src, tmp_path / "b.json", lambda d: d["tally"].update(barcodeAgree=d["tally"]["barcodeCells"] - 1))
    nothing_compared = _tamper(src, tmp_path / "c.json", lambda d: d["tally"].update(windows=0, windowsMatched=0))
    for path in (one_window_off, one_cell_off, nothing_compared):
        assert _gate(build_validation_report(g11_report_path=path), "G11")["status"] == "FAIL"
