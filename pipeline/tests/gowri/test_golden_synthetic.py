import json
import math

import numpy as np
import pytest

from lumen_pipeline.reference.events import Event, detect_events
from lumen_pipeline.reference.power import Panel, evaluate_power_series
from lumen_pipeline.reference.uncertainty import (
    exact_event_uncertainty,
    fast_event_uncertainty,
    limb_offset_deg,
    numeric_bounds,
    three_pass_bounds,
    total_clearance_rate_deg_per_hour,
)
from lumen_pipeline.reference.visibility import Horizon, availability
from lumen_pipeline.reference.windows import merge_windows
from lumen_pipeline.validation.golden_synthetic import (
    build_synthetic_golden_set,
    synthetic_golden_payload,
)


def _case(payload, case_id):
    return next(case for case in payload["cases"] if case["id"] == case_id)


def test_synthetic_golden_set_schema_and_determinism(tmp_path):
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    payload = build_synthetic_golden_set(first)
    build_synthetic_golden_set(second)

    assert first.read_bytes() == second.read_bytes()
    assert json.loads(first.read_text(encoding="utf-8")) == payload
    assert payload["set"] == 2
    assert payload["provenance"]["synthetic"] is True
    assert payload["provenance"]["terrain_artifacts"] == "none"
    assert all(set(payload["case_schema"]["required"]) <= set(case) for case in payload["cases"])
    assert len({case["id"] for case in payload["cases"]}) == len(payload["cases"])


def test_synthetic_golden_vectors_match_reference_primitives():
    payload = synthetic_golden_payload()
    flat = _case(payload, "synthetic_flat_visibility_boundaries")
    for expected in flat["expected"]["visibility"]:
        fraction, clearance, visible = availability("sun", expected["elevation_deg"], 0.0, 149597870.7, Horizon(np.zeros(3600)), disk_threshold=0.5)
        assert clearance == pytest.approx(expected["clearance_deg"])
        assert fraction == expected["disk_fraction"]
        assert visible is expected["visible"]

    terrain = _case(payload, "synthetic_terrain_mask_boundary")
    for expected in terrain["expected"]["visibility"]:
        _, clearance, visible = availability("sun", expected["elevation_deg"], 0.0, 149597870.7, Horizon(np.full(3600, 4.0)), disk_threshold=0.5)
        assert clearance == pytest.approx(expected["clearance_deg"])
        assert visible is expected["visible"]

    limbs = _case(payload, "synthetic_disk_limb_conventions")["expected"]["limb_clearance_offset_deg"]
    assert limb_offset_deg(0.0, 0.25) == limbs["disk_0_pct"]
    assert limb_offset_deg(0.5, 0.25) == limbs["disk_50_pct"]
    assert limb_offset_deg(1.0, 0.25) == limbs["disk_100_pct"]


def test_synthetic_golden_events_uncertainty_and_slope_edges():
    payload = synthetic_golden_payload()
    events = detect_events(0.0, 240.0, lambda et: et >= 0.0, down="sunset", up="shadowExit")
    window = merge_windows("sun", [0.0, 120.0, 240.0], [True, True, True], [1.0, 1.0, 1.0])[0]
    expected_window = _case(payload, "synthetic_event_at_window_start")["expected"]
    assert events == expected_window["events"]
    assert window.partial_start is expected_window["window"]["partial_start"]

    horizon = Horizon(np.arange(3600, dtype=float) * 0.01)
    rate = total_clearance_rate_deg_per_hour(100.0, lambda et: (5.0 + 0.001 * et, 10.0 + 0.1 * et), horizon)
    assert rate == pytest.approx(_case(payload, "synthetic_total_clearance_rate")["expected"]["clearance_rate_deg_per_hour"])

    sigma_horizon = Horizon(np.full(3600, 1.0))
    bounds = numeric_bounds(three_pass_bounds(sigma_horizon, 0.2, lambda current: current.elevation_at(0.0)))
    assert bounds == pytest.approx(_case(payload, "synthetic_three_pass_bounds")["expected"]["numeric_bounds"])

    exact = exact_event_uncertainty(Event("sunset", 100.0), Event("sunset", 80.0), Event("sunset", 120.0))
    assert exact.delta_t_seconds == _case(payload, "synthetic_exact_event_uncertainty")["expected"]["delta_t_seconds"]

    grazing = fast_event_uncertainty(0.0, lambda _: (0.0, 0.0), Horizon(np.zeros(3600)), lambda _: 0.2)
    assert math.isinf(grazing.delta_t_seconds)
    assert grazing.grazing_reason == _case(payload, "synthetic_grazing_rate")["expected"]["grazing_reason"]

    slope = Horizon(np.full(3600, -1.0), slope_deg=10.0, uphill_azimuth_deg=0.0, d_min_m=15.0, observer_height_m=1.0)
    expected_slope = _case(payload, "synthetic_near_zone_slope_edges")["expected"]
    assert slope.effective_at(180.0) == pytest.approx(expected_slope["flat_or_downhill_effective_deg"])
    assert slope.effective_at(90.0) == pytest.approx(expected_slope["cross_slope_effective_deg"])
    assert slope.effective_at(0.0) == pytest.approx(expected_slope["uphill_effective_deg"], abs=0.01)


def test_synthetic_golden_ops_elevation_definition():
    expected = _case(synthetic_golden_payload(), "synthetic_min_sun_elevation_ops")["expected"]
    _, _, visible = availability("sun", 5.0, 0.0, 149597870.7, Horizon(np.zeros(3600)), disk_threshold=0.5, min_sun_elevation_ops_deg=6.0)
    assert visible is expected["visible"]


def test_synthetic_golden_power_eclipse_soc_vector():
    case = _case(synthetic_golden_payload(), "synthetic_power_eclipse_soc")
    input_data = case["input"]
    expected = case["expected"]
    result = evaluate_power_series(
        input_data["times_et"],
        [np.array([0.0, 0.0, 1.0]), np.array([0.0, 0.0, 1.0])],
        [input_data["sun_distance_km"]] * 2,
        input_data["disk_fractions"],
        [Panel(np.array(input_data["panel_normal"]), input_data["panel_area_m2"], input_data["panel_efficiency"])],
        input_data["load_w"],
        battery_capacity_wh=input_data["battery_capacity_wh"],
        usable_depth_of_discharge=input_data["usable_depth_of_discharge"],
        initial_soc_fraction=input_data["initial_soc_fraction"],
    )
    assert result.generation_w.tolist() == pytest.approx(expected["generation_w"])
    assert result.net_w.tolist() == pytest.approx(expected["net_w"])
    assert result.stored_energy_wh.tolist() == pytest.approx(expected["stored_energy_wh"])
