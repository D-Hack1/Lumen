import json

import numpy as np

from lumen_pipeline.ephem.ephemeris import hermite_position
from lumen_pipeline.reference.events import detect_events
from lumen_pipeline.reference.interp import Ephemeris
from lumen_pipeline.reference.visibility import Horizon, availability
from lumen_pipeline.reference.windows import merge_windows
from lumen_pipeline.validation.golden import build_golden_set, default_ephemeris_path


def test_hermite_interpolation_recovers_constant_velocity_motion():
    nodes = np.zeros((2, 12), dtype=np.float32)
    nodes[0, 0:3] = [0.0, 0.0, 0.0]
    nodes[1, 0:3] = [3600.0, 0.0, 0.0]
    nodes[:, 3] = 1.0
    nodes[0, 6:9] = [0.0, 10.0, 0.0]
    nodes[1, 6:9] = [0.0, 3610.0, 0.0]
    nodes[:, 10] = 1.0

    positions = hermite_position(nodes, 0.0, 900.0)

    np.testing.assert_allclose(positions, [[900.0, 0.0, 0.0], [0.0, 910.0, 0.0]])


def test_ephemeris_loader_reports_git_lfs_pointer_before_reshape(tmp_path):
    binary = tmp_path / "ephem.bin"
    binary.write_text("version https://git-lfs.github.com/spec/v1\noid sha256:deadbeef\nsize 3366144\n")
    binary.with_suffix(".json").write_text(
        json.dumps({"frame": "MOON_ME_DE421", "step_seconds": 3600, "shape": [70128, 12], "start_et_tdb": 0})
    )

    with np.testing.assert_raises_regex(ValueError, "Git LFS pointer"):
        Ephemeris.from_file(binary)


def test_flat_horizon_visibility_boundaries_are_not_invented():
    horizon = Horizon(np.zeros(3600, dtype=float))
    above = availability("sun", 5.0, 0.0, 149_597_870.7, horizon, disk_threshold=0.5)
    below = availability("sun", -5.0, 0.0, 149_597_870.7, horizon, disk_threshold=0.5)

    assert above[0] == 1.0 and above[2]
    assert below[0] == 0.0 and not below[2]


def test_event_refinement_and_window_merging_use_explicit_endpoints():
    events = detect_events(0.0, 240.0, lambda et: et < 55.0, down="sunset", up="shadowExit")
    windows = merge_windows("sun", [0.0, 10.0, 20.0, 30.0], [False, True, True, False], [-1.0, 1.0, 2.0, -1.0])

    assert len(events) == 1
    assert events[0].type == "sunset"
    assert abs(events[0].et - 55.0) <= 10.0
    assert [(window.start_et, window.end_et, window.peak_elevation_deg) for window in windows] == [(10.0, 30.0, 2.0)]


def test_golden_set_is_reproducible_and_declares_missing_dependencies(tmp_path):
    first_path = tmp_path / "first.json"
    second_path = tmp_path / "second.json"
    first = build_golden_set(first_path, default_ephemeris_path())
    build_golden_set(second_path, default_ephemeris_path())

    assert json.loads(first_path.read_text(encoding="utf-8")) == first
    assert first_path.read_bytes() == second_path.read_bytes()
    case = first["cases"][0]
    assert case["input"]["terrain_mode"] == "smooth_sphere_pending_im2_mask"
    assert "dsn" in case["unavailable"]
    assert case["metrics"]["linkPct"]["value"] is None
