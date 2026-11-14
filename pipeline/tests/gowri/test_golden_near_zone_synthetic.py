import json
import math

import numpy as np
import pytest

from lumen_pipeline.terrain.masks import _apply_near_zone
from lumen_pipeline.validation.golden_near_zone_synthetic import (
    BIN_WIDTH_DEG,
    HEIGHTS_M,
    _near,
    build_synthetic_near_zone_golden_set,
    default_synthetic_output_path,
    synthetic_near_zone_payload,
)


def _fixture() -> dict[str, object]:
    return json.loads(default_synthetic_output_path().read_text(encoding="utf-8"))


def test_near_zone_synthetic_fixture_is_deterministic_and_committed(tmp_path):
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    payload = build_synthetic_near_zone_golden_set(first)
    build_synthetic_near_zone_golden_set(second)

    assert first.read_bytes() == second.read_bytes()
    assert first.read_bytes() == default_synthetic_output_path().read_bytes()
    assert json.loads(first.read_text(encoding="utf-8")) == payload == synthetic_near_zone_payload()
    assert payload["array_initialization"] == {
        "shape": [4, 3600],
        "order": "height_major",
        "unselected_elevation_deg": "NaN",
        "unselected_distance_km": "NaN",
        "json_null": "NaN",
        "selected_bins": "override defaults with distant inputs",
    }
    assert payload["azimuth_bins"]["center_deg"] == "(azimuth_bin + 0.5) * 0.1"
    assert payload["observer_heights_m"] == list(HEIGHTS_M)


def test_near_zone_synthetic_fixture_replays_production_helper():
    payload = _fixture()
    tolerance = payload["tolerances"]
    azimuth = (np.arange(3600, dtype=np.float64) + 0.5) * BIN_WIDTH_DEG
    for case in payload["cases"]:
        elevation = np.full((4, 3600), np.nan, dtype=np.float64)
        distance = np.full((4, 3600), np.nan, dtype=np.float64)
        for item in case["selected_bins"]:
            height_index = HEIGHTS_M.index(item["observer_height_m"])
            elevation[height_index, item["azimuth_bin"]] = item["distant_elevation_deg"]
            distance[height_index, item["azimuth_bin"]] = item["distant_distance_km"]

        _apply_near_zone(
            elevation,
            distance,
            _near(case["slope_deg"], case["uphill_azimuth_deg"]),
            HEIGHTS_M,
            azimuth,
        )
        for item in case["selected_bins"]:
            height_index = HEIGHTS_M.index(item["observer_height_m"])
            bin_index = item["azimuth_bin"]
            assert elevation[height_index, bin_index] == pytest.approx(
                item["expected_elevation_deg"], abs=tolerance["elevation_deg"]
            )
            assert distance[height_index, bin_index] == pytest.approx(
                item["expected_distance_km"], abs=tolerance["distance_km"]
            )


def test_near_zone_synthetic_fixture_matches_independent_plane_analytic():
    payload = _fixture()
    tolerance = payload["tolerances"]
    for case in payload["cases"]:
        slope = math.radians(case["slope_deg"])
        uphill = math.radians(case["uphill_azimuth_deg"])
        d_min_m = case["d_min_m"]
        for item in case["selected_bins"]:
            plane_elevation = max(
                0.0,
                math.degrees(
                    math.atan(
                        math.tan(slope)
                        * math.cos(math.radians(item["azimuth_deg"]) - uphill)
                        - item["observer_height_m"] / d_min_m
                    )
                ),
            )
            distant_elevation = item["distant_elevation_deg"]
            replaces_distant = distant_elevation is None or plane_elevation > distant_elevation
            expected_elevation = plane_elevation if replaces_distant else distant_elevation
            expected_distance = d_min_m / 1000.0 if replaces_distant else item["distant_distance_km"]
            assert item["expected_elevation_deg"] == pytest.approx(
                expected_elevation, abs=tolerance["elevation_deg"]
            )
            assert item["expected_distance_km"] == pytest.approx(
                expected_distance, abs=tolerance["distance_km"]
            )

    slope_case = next(case for case in payload["cases"] if case["slope_deg"] == 20.0)
    downhill_negative = next(
        item
        for item in slope_case["selected_bins"]
        if item["azimuth_bin"] == 1800 and item["observer_height_m"] == 1.0
    )
    assert downhill_negative["distant_elevation_deg"] < 0.0
    assert downhill_negative["expected_elevation_deg"] == 0.0
    assert downhill_negative["expected_distance_km"] == 0.03
