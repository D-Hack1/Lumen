import json

import pytest

from lumen_pipeline.validation.g7 import (
    REFERENCE_ELEVATION_DEG,
    TOLERANCE_DEG,
    build_g7_report,
    write_g7_report,
)


def test_g7_report_reproduces_touchdown_reference_and_provenance(tmp_path):
    report_path = tmp_path / "g7.json"
    repeated_path = tmp_path / "g7-repeated.json"
    report = write_g7_report(report_path)
    write_g7_report(repeated_path)
    reread = json.loads(report_path.read_text(encoding="utf-8"))

    assert reread == report
    assert report_path.read_bytes() == repeated_path.read_bytes()
    assert report["status"] == "PASS", json.dumps(
        {
            "numerical_result": report["numerical_result"],
            "provenance_result": report["provenance_result"],
            "sun_elevation_deg": report["computed"]["sun_elevation_deg"],
            "absolute_error_deg": report["absolute_error_deg"],
            "ephemeris_hash_matches_sidecar": report["ephemeris"][
                "ephemeris_hash_matches_sidecar"
            ],
            "kernel_hashes_match_sidecar": report["ephemeris"]["kernel_hashes_match_sidecar"],
            "failure_reasons": report["failure_reasons"],
        },
        sort_keys=True,
    )
    assert report["timestamp_utc"] == "2023-08-23T12:33:00Z"
    assert report["coordinates"]["latitude_deg"] == pytest.approx(-69.373)
    assert report["coordinates"]["longitude_deg_east"] == pytest.approx(32.319)
    assert report["reference"]["sun_elevation_deg"] == REFERENCE_ELEVATION_DEG
    assert report["reference"]["tolerance_deg"] == TOLERANCE_DEG
    assert report["absolute_error_deg"] == pytest.approx(
        abs(report["computed"]["sun_elevation_deg"] - REFERENCE_ELEVATION_DEG)
    )
    assert report["numerical_result"] == "PASS"
    expected_provenance_reasons = []
    if not report["ephemeris"]["ephemeris_hash_matches_sidecar"]:
        expected_provenance_reasons.append("ephemeris_sha256_mismatch")
    if not report["ephemeris"]["kernel_hashes_match_sidecar"]:
        expected_provenance_reasons.append("kernel_sha256_mismatch")
    assert report["provenance_result"] == (
        "PASS" if not expected_provenance_reasons else "FAIL"
    )
    assert report["failure_reasons"]["numerical"] == []
    assert report["failure_reasons"]["provenance"] == expected_provenance_reasons
    assert report["failure_reasons"]["timeline"] == []
    assert report["qualitative_timeline_check"]["status"] == "PASS"
    assert report["qualitative_timeline_check"]["sun_below_6_deg_utc"].startswith("2023-09-")
    assert report["ephemeris"]["ephemeris_hash_matches_sidecar"]
    assert report["reference"]["primary_source_status"].startswith("UNVERIFIED")


def test_g7_uses_landing_coordinates_not_prelanding_target():
    report = build_g7_report()

    assert report["coordinates"]["latitude_deg"] == pytest.approx(-69.373)
    assert report["coordinates"]["longitude_deg_east"] == pytest.approx(32.319)
    assert report["coordinates"]["latitude_deg"] != pytest.approx(-69.367621)
    assert report["coordinates"]["longitude_deg_east"] != pytest.approx(32.348126)
