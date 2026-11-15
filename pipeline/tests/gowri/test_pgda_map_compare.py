import json

import numpy as np
import pytest
import rasterio
from pyproj import CRS, Transformer
from rasterio.transform import from_origin

from lumen_pipeline.validation.pgda_map_compare import (
    CoordinateOutsideMapError,
    build_g5_gate,
    sample_pgda_pixel,
)


def _write_map(path, value=12_500):
    latitude = -89.54
    longitude = 129.0
    lunar_geographic = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs +type=crs")
    lunar_stereographic = CRS.from_proj4(
        "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs +type=crs"
    )
    transformer = Transformer.from_crs(lunar_geographic, lunar_stereographic, always_xy=True)
    x_m, y_m = transformer.transform(longitude, latitude)
    transform = from_origin(x_m - 150.0, y_m + 90.0, 60.0, 60.0)
    values = np.full((4, 4), -32768, dtype=np.int16)
    values[1, 2] = value
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=4,
        width=4,
        count=1,
        dtype="int16",
        crs=lunar_stereographic,
        transform=transform,
        nodata=-32768,
    ) as dataset:
        dataset.write(values, 1)
        dataset.scales = (4e-5,)
        dataset.offsets = (0.0,)
        dataset.update_tags(PRODUCT_ID="test-pgda-map", DATA_SET_ID="test-dataset")
    return latitude, longitude


def test_pgda_pixel_sampling_uses_containing_pixel_and_scale(tmp_path):
    path = tmp_path / "reference.tiff"
    latitude, longitude = _write_map(path)

    sample = sample_pgda_pixel(path, latitude, longitude)

    assert sample["status"] == "SAMPLED"
    assert sample["product_id"] == "test-pgda-map"
    assert sample["pixel"]["row"] == 1
    assert sample["pixel"]["column"] == 2
    assert sample["pixel"]["center_offset_m"] == pytest.approx(0.0, abs=1e-8)
    assert sample["raw_value"] == 12_500
    assert sample["fraction"] == pytest.approx(0.5)
    assert len(sample["sha256"]) == 64
    assert sample["path"] == f"external/{path.name}"
    assert str(tmp_path).replace("\\", "/") not in json.dumps(sample)


def test_pgda_pixel_sampling_rejects_coordinates_outside_map(tmp_path):
    path = tmp_path / "reference.tiff"
    _write_map(path)

    with pytest.raises(CoordinateOutsideMapError, match="outside the PGDA map"):
        sample_pgda_pixel(path, -70.0, 0.0)


def test_pgda_pixel_sampling_respects_documented_latitude_coverage(tmp_path):
    path = tmp_path / "reference.tiff"
    _write_map(path)

    with pytest.raises(CoordinateOutsideMapError, match="documented PGDA coverage"):
        sample_pgda_pixel(path, -84.7906, 29.1957, latitude_coverage="85S-90S")


def test_g5_gate_records_reference_samples_but_never_passes_without_model_average(tmp_path):
    raster = tmp_path / "reference.tiff"
    latitude, longitude = _write_map(raster)
    mask_dir = tmp_path / "masks"
    mask_dir.mkdir()
    (mask_dir / "test-site.bin").write_bytes(b"mask")
    (mask_dir / "test-site.json").write_text(
        json.dumps({"site_id": "test-site", "heights_m": [1.0, 2.0, 5.0, 10.0]}), encoding="utf-8"
    )
    sites_path = tmp_path / "sites.yaml"
    sites_path.write_text(
        "sites:\n"
        "  - id: test-site\n"
        f"    latitude_deg: {latitude}\n"
        f"    longitude_deg_east: {longitude}\n"
        "    verification_status: verified\n"
        "    tier: A\n",
        encoding="utf-8",
    )

    gate = build_g5_gate(
        reference_maps={"average_solar_illumination": raster},
        sites_path=sites_path,
        mask_dir=mask_dir,
    )

    assert gate["status"] == "BLOCKED"
    assert gate["comparisons"][0]["reference_fraction"] == pytest.approx(0.5)
    assert gate["comparisons"][0]["computed_fraction"] is None
    assert gate["comparisons"][0]["absolute_error_fraction"] is None
    assert gate["comparisons"][0]["status"] == "BLOCKED"
    assert any("numeric tolerance" in blocker for blocker in gate["blockers"])
    assert any("matching LUMEN aggregation interval is unresolved" in blocker for blocker in gate["blockers"])
    assert any("no 0 m observer-height" in blocker for blocker in gate["blockers"])
    source = gate["reference_maps"]["average_solar_illumination"]["source_metadata"]
    assert source["product_id"] == 69
    assert "18.6-year" in source["value_meaning"]
    assert gate["reference_maps"]["average_solar_illumination"]["path"] == "external/reference.tiff"
    assert str(tmp_path).replace("\\", "/") not in json.dumps(gate)


def test_missing_pgda_inputs_are_portable_and_reported_as_blocked(tmp_path):
    gate = build_g5_gate(
        reference_maps={"average_solar_illumination": tmp_path / "missing.tiff"},
        sites_path=tmp_path / "missing-sites.yaml",
        mask_dir=tmp_path / "missing-masks",
    )

    assert gate["status"] == "BLOCKED"
    assert gate["comparisons"] == []
    assert gate["missing_inputs"] == ["external/missing-sites.yaml", "external/missing.tiff"]
    assert "inputs are missing" in gate["reason"]
    assert str(tmp_path).replace("\\", "/") not in json.dumps(gate)


def test_missing_pgda_map_is_reported_without_absolute_paths_or_exception(tmp_path):
    sites_path = tmp_path / "sites.yaml"
    sites_path.write_text("sites: []\n", encoding="utf-8")
    missing_map = tmp_path / "missing.tiff"

    gate = build_g5_gate(
        reference_maps={"average_solar_illumination": missing_map},
        sites_path=sites_path,
        mask_dir=tmp_path / "masks",
    )

    assert gate["status"] == "BLOCKED"
    assert gate["missing_inputs"] == ["external/missing.tiff"]
    assert "inputs are missing" in gate["reason"]
    assert str(tmp_path).replace("\\", "/") not in json.dumps(gate)
