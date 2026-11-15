import json
import struct

import numpy as np
import pytest
import yaml

from lumen_pipeline.catalog import sparklines
from lumen_pipeline.reference.interp import BodyGeometry


class _Ephemeris:
    start_et = 10_000.0

    def body_at(self, body, et, latitude_deg, longitude_deg_east, height_m):
        del latitude_deg, longitude_deg_east, height_m
        hour = (et - self.start_et) % 86400.0 / 3600.0
        elevation = 1.0 if body == "earth" or hour < 12.0 else -1.0
        return BodyGeometry(np.array([1.0, 0.0, 0.0]), 1_000_000.0, 0.0, elevation)


class _ConstantEphemeris:
    start_et = 10_000.0

    def __init__(self, elevation):
        self.elevation = elevation

    def body_at(self, body, et, latitude_deg, longitude_deg_east, height_m):
        del body, et, latitude_deg, longitude_deg_east, height_m
        return BodyGeometry(np.array([1.0, 0.0, 0.0]), 1_000_000.0, 0.0, self.elevation)


def _inputs(tmp_path):
    sites = {
        "sites": [
            {"id": "smooth", "latitude_deg": -80.0, "longitude_deg_east": 20.0},
            {"id": "shackleton_ridge", "latitude_deg": -89.54, "longitude_deg_east": 129.0},
        ]
    }
    sites_path = tmp_path / "sites.yaml"
    sites_path.write_text(yaml.safe_dump(sites), encoding="utf-8")
    ephemeris_path = tmp_path / "ephem.bin"
    ephemeris_path.write_bytes(b"test")
    ephemeris_path.with_suffix(".json").write_text(
        json.dumps({"start_utc": "2023-01-01T00:00:00Z", "end_utc": "2023-01-04T00:00:00Z"}),
        encoding="utf-8",
    )
    return sites_path, ephemeris_path


def test_sparklines_are_deterministic_and_use_utc_day_boundaries(tmp_path, monkeypatch):
    sites_path, ephemeris_path = _inputs(tmp_path)
    monkeypatch.setattr(sparklines.Ephemeris, "from_file", lambda path: _Ephemeris())
    first = tmp_path / "first.bin"
    second = tmp_path / "second.bin"

    metadata = sparklines.build_sparklines(
        sites_path, ephemeris_path, first, tmp_path / "missing-terrain",
        start_utc="2023-01-01T00:00:00Z", end_utc="2023-01-03T00:00:00Z",
    )
    sparklines.build_sparklines(
        sites_path, ephemeris_path, second, tmp_path / "missing-terrain",
        start_utc="2023-01-01T00:00:00Z", end_utc="2023-01-03T00:00:00Z",
    )

    assert first.read_bytes() == second.read_bytes()
    assert first.with_suffix(".json").read_bytes() == second.with_suffix(".json").read_bytes()
    assert metadata["shape"] == [1, 2, 2]
    assert metadata["units"] == "percent"
    assert np.fromfile(first, dtype=np.uint8).tolist() == [50, 50, 100, 100]


def test_sparklines_mark_missing_masks_and_exclude_preliminary_shackleton(tmp_path, monkeypatch):
    sites_path, ephemeris_path = _inputs(tmp_path)
    monkeypatch.setattr(sparklines.Ephemeris, "from_file", lambda path: _Ephemeris())

    metadata = sparklines.build_sparklines(
        sites_path, ephemeris_path, tmp_path / "sparklines.bin", tmp_path / "missing-terrain",
        start_utc="2023-01-01T00:00:00Z", end_utc="2023-01-02T00:00:00Z",
    )

    assert metadata["sites"] == ["smooth"]
    assert metadata["provenance"] == {"smooth": "smooth-Moon bounds"}
    assert "unresolved target coordinates" in metadata["excluded_sites"]["shackleton_ridge"]


def test_sparklines_encode_percentage_boundaries():
    site = {"latitude_deg": -80.0, "longitude_deg_east": 20.0}
    horizon = sparklines.Horizon(observer_height_m=2.0)
    day = sparklines.parse_utc("2023-01-01T00:00:00Z")

    assert sparklines._daily_percentages(_ConstantEphemeris(-1.0), site, horizon, day, day) == (0, 0)
    assert sparklines._daily_percentages(_ConstantEphemeris(1.0), site, horizon, day, day) == (100, 100)


def test_mask_requires_matching_coordinate_metadata(tmp_path):
    root = tmp_path / "terrain"
    masks = root / "masks"
    masks.mkdir(parents=True)
    site = {"id": "smooth", "latitude_deg": -80.0, "longitude_deg_east": 20.0}
    metadata = {
        "site_id": "smooth",
        "latitude_deg": -80.0,
        "longitude_deg_east": 20.0,
        "heights_m": [1.0, 2.0, 5.0, 10.0],
        "azimuth_count": 3600,
        "bin_width_deg": 0.1,
        "slope_deg": 0.0,
        "uphill_azimuth_deg": 0.0,
        "d_min_m": 30.0,
    }
    header = struct.pack(
        "<8sHHIIfffIIIIIIQ", b"LUMENMSK", 1, 64, 4, 3600, 0.1, 250.0, 1.0,
        64, 57664, 57600, 57600, 0, 0, 0,
    )
    (masks / "smooth.bin").write_bytes(header + np.zeros((4, 7200), dtype="<f4").tobytes())
    (masks / "smooth.json").write_text(json.dumps(metadata), encoding="utf-8")

    assert sparklines._mask_horizon(site, root) is not None
    metadata.pop("latitude_deg")
    (masks / "smooth.json").write_text(json.dumps(metadata), encoding="utf-8")
    assert sparklines._mask_horizon(site, root) is None
    metadata["latitude_deg"] = -79.0
    (masks / "smooth.json").write_text(json.dumps(metadata), encoding="utf-8")
    assert sparklines._mask_horizon(site, root) is None


def test_sparklines_require_utc_midnight_bounds(tmp_path, monkeypatch):
    sites_path, ephemeris_path = _inputs(tmp_path)
    monkeypatch.setattr(sparklines.Ephemeris, "from_file", lambda path: _Ephemeris())

    try:
        sparklines.build_sparklines(
            sites_path, ephemeris_path, tmp_path / "sparklines.bin", start_utc="2023-01-01T01:00:00Z"
        )
    except ValueError as error:
        assert "UTC midnight" in str(error)
    else:
        raise AssertionError("non-midnight boundary was accepted")


def test_sparklines_reject_ranges_beyond_ephemeris_coverage(tmp_path, monkeypatch):
    sites_path, ephemeris_path = _inputs(tmp_path)
    monkeypatch.setattr(sparklines.Ephemeris, "from_file", lambda path: _Ephemeris())

    with pytest.raises(ValueError, match="outside the interpolable ephemeris range"):
        sparklines.build_sparklines(
            sites_path,
            ephemeris_path,
            tmp_path / "sparklines.bin",
            start_utc="2023-01-03T00:00:00Z",
            end_utc="2023-01-05T00:00:00Z",
        )
