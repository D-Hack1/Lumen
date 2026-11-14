"""Hermetic S-4 crop, mask, and summary tests."""

from __future__ import annotations

import json
import struct

import numpy as np
import pytest
from rasterio.transform import from_origin

from lumen_pipeline.terrain.crops import (
    CropCoverageError,
    CropSpec,
    TerrainCrop,
    build_crops,
)
from lumen_pipeline.terrain.dem_io import LUNAR_SPHERICAL_CRS, DemProduct, DemWindow
from lumen_pipeline.terrain.horizon import HorizonResult
from lumen_pipeline.terrain.masks import (
    NearFieldUnavailable,
    _apply_near_zone,
    generate_tier_a_mask,
)
from lumen_pipeline.terrain.summaries import write_terrain_summary

SITE_ID = "im2_athena"
LATITUDE = -84.7906
LONGITUDE = 29.1957


def _product(key: str, resolution_m: float, coverage: str) -> DemProduct:
    return DemProduct(
        key=key,
        name=key,
        url=f"https://example.invalid/{key}.tif",
        resolution_m=resolution_m,
        latitude_coverage=coverage,
        unit="m",
        scale=1.0,
        offset=0.0,
        nodata=-9999.0,
        vertical_reference="height_relative",
        verification_status="source_page_and_urls_provided",
    )


def _dem(pixel_m: float = 5.0, size: int = 101) -> DemWindow:
    lat_step = np.degrees(pixel_m / 1_737_400.0)
    lon_step = np.degrees(pixel_m / (1_737_400.0 * np.cos(np.radians(LATITUDE))))
    return DemWindow(
        elevation=np.zeros((size, size), dtype=np.float32),
        valid=np.ones((size, size), dtype=bool),
        transform=from_origin(
            LONGITUDE - size * lon_step / 2.0,
            LATITUDE + size * lat_step / 2.0,
            lon_step,
            lat_step,
        ),
        crs=LUNAR_SPHERICAL_CRS,
        bounds=(0.0, 0.0, 0.0, 0.0),
        resolution_m=(pixel_m, pixel_m),
        source="synthetic",
        provenance={"synthetic": True},
    )


class _Reader:
    def __init__(self, dem: DemWindow):
        self.dem = dem
        self.widths: list[float] = []

    def read_site_window(self, product, *, lon_deg, lat_deg, width_m, height_m):
        self.widths.append(width_m)
        return self.dem


def _crops(dem: DemWindow) -> tuple[TerrainCrop, TerrainCrop, TerrainCrop]:
    products = (
        _product("site_specific_5m_lola_pgda_78", 5.0, "80S-90S"),
        _product("polar_20m_lola_pgda_90", 20.0, "80S-90S"),
        _product("regional_240m_lola_pgda_90", 240.0, "60S-90S"),
    )
    specs = (
        ("near", 0.0, 5.0, 5.0, products[0]),
        ("mid", 5.0, 80.0, 20.0, products[1]),
        ("far", 80.0, 250.0, 240.0, products[2]),
    )
    return tuple(
        TerrainCrop(
            spec=CropSpec(
                name,
                minimum,
                maximum,
                (product.key,),
                preferred,
            ),
            dem=dem,
            source_key=product.key,
            source_resolution_m=product.resolution_m,
            source_url=product.url,
        )
        for name, minimum, maximum, preferred, product in specs
    )


def test_crops_select_ordered_sources_and_preserve_boundaries():
    reader = _Reader(_dem())
    products = {
        "site_specific_5m_lola_pgda_78": _product("site_specific_5m_lola_pgda_78", 5.0, "80S-90S"),
        "polar_20m_lola_pgda_90": _product("polar_20m_lola_pgda_90", 20.0, "80S-90S"),
        "regional_240m_lola_pgda_90": _product("regional_240m_lola_pgda_90", 240.0, "60S-90S"),
    }
    crops = build_crops(
        SITE_ID,
        latitude_deg=LATITUDE,
        longitude_deg_east=LONGITUDE,
        reader=reader,
        products=products,
        allow_unavailable=False,
    )
    assert crops.near.source_key == "site_specific_5m_lola_pgda_78"
    assert crops.mid.source_key == "polar_20m_lola_pgda_90"
    assert crops.far.source_key == "regional_240m_lola_pgda_90"
    assert crops.for_distance_km(5.0).source_key == "polar_20m_lola_pgda_90"
    assert crops.for_distance_km(80.0).source_key == "regional_240m_lola_pgda_90"
    with pytest.raises(CropCoverageError):
        crops.for_distance_km(250.1)
    assert reader.widths == [10_000.0, 160_000.0, 500_000.0]


def test_missing_near_coverage_is_recorded_not_fabricated():
    reader = _Reader(_dem())
    products = {
        "site_specific_5m_lola_pgda_78": _product("site_specific_5m_lola_pgda_78", 5.0, "87S-90S"),
        "polar_20m_lola_pgda_90": _product("polar_20m_lola_pgda_90", 20.0, "80S-90S"),
        "regional_240m_lola_pgda_90": _product("regional_240m_lola_pgda_90", 240.0, "60S-90S"),
    }
    crops = build_crops(
        SITE_ID,
        latitude_deg=LATITUDE,
        longitude_deg_east=LONGITUDE,
        reader=reader,
        products=products,
    )
    assert crops.near is None
    assert "near" in crops.unavailable
    assert crops.mid is not None


def test_mask_header_payload_metadata_and_summary(monkeypatch, tmp_path):
    crops = type(
        "Crops",
        (),
        {
            "site_id": SITE_ID,
            "latitude_deg": LATITUDE,
            "longitude_deg_east": LONGITUDE,
            "near": _crops(_dem())[0],
            "mid": _crops(_dem())[1],
            "far": _crops(_dem())[2],
            "unavailable": {},
            "near_field_resolution_m": 5.0,
        },
    )()

    def fake_raycast(*args, **kwargs):
        elevation = np.full((4, 3600), -1.0, dtype=np.float32)
        distance = np.full((4, 3600), 10.0, dtype=np.float32)
        elevation[0, 0] = np.nan
        distance[0, 0] = np.nan
        return HorizonResult(
            elevation,
            distance,
            (np.arange(3600) + 0.5) * 0.1,
            (1.0, 2.0, 5.0, 10.0),
            0.1,
            15.0,
            250.0,
        )

    monkeypatch.setattr("lumen_pipeline.terrain.masks.raycast_horizon", fake_raycast)
    artifact = generate_tier_a_mask(
        SITE_ID,
        crops,
        output_root=tmp_path / "terrain",
        geometric_growth_factor=1.5,
    )
    assert artifact.elevation_deg.shape == (4, 3600)
    assert artifact.distance_km.shape == (4, 3600)
    assert artifact.binary_path.stat().st_size == 115264
    header = struct.unpack("<8sHHIIfffIIIIIIQ", artifact.binary_path.read_bytes()[:64])
    assert header[:5] == (b"LUMENMSK", 1, 64, 4, 3600)
    assert header[8:12] == (64, 57664, 57600, 57600)
    metadata = json.loads(artifact.sidecar_path.read_text(encoding="utf-8"))
    assert metadata["heights_m"] == [1.0, 2.0, 5.0, 10.0]
    assert metadata["azimuth_zero"] == "projected_site_frame_reference"
    assert metadata["azimuth_direction"] == "toward_site_frame_e"
    assert metadata["near_field_resolution_m"] == 5.0
    assert metadata["d_min_m"] == 15.0
    assert metadata["median_filter_radius_m"] == 100.0
    assert "median_filter_region_radius_m" not in metadata
    assert metadata["median_filter_kernel_px"] == 3
    assert metadata["median_filter_status"] == "applied"
    assert metadata["provenance"]["median_filter_reason"] is None
    assert metadata["plane_fit_kernel_px"] == 7
    assert metadata["plane_fit_half_width_px"] == 3
    assert metadata["global_max_deg"][0] == 0.0
    assert metadata["global_min_deg"][0] == 0.0
    assert metadata["dem_source"] == "site_specific_5m_lola_pgda_78"
    assert metadata["binary"] == {
        "magic": "LUMENMSK",
        "format_version": 1,
        "byte_order": "little",
        "float_encoding": "ieee754-binary32",
        "layout": "header_then_elevation_then_distance",
        "array_order": "c_contiguous_height_major",
    }
    payload = artifact.binary_path.read_bytes()
    elevation = np.frombuffer(payload, dtype="<f4", count=4 * 3600, offset=64)
    distance = np.frombuffer(payload, dtype="<f4", count=4 * 3600, offset=57664)
    assert np.isfinite(elevation).all()
    assert np.isfinite(distance).all()
    assert np.all((np.isfinite(distance) & (distance > 0) & (distance <= 250)) | np.isnan(distance))

    old_manifest = {"version": "old", "artifacts": {"other": {"version": "1"}}}
    (tmp_path / "terrain" / "manifest.json").write_text(json.dumps(old_manifest), encoding="utf-8")
    summary_path = write_terrain_summary(
        SITE_ID,
        crops,
        mask=artifact,
        output_root=tmp_path / "terrain",
    )
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    manifest = json.loads((tmp_path / "terrain" / "manifest.json").read_text(encoding="utf-8"))
    assert summary["mask_available"] is True
    assert summary["dem_source"] == "site_specific_5m_lola_pgda_78"
    assert "other" in manifest["artifacts"]
    assert SITE_ID in manifest["artifacts"]


def test_complete_filtering_is_required_before_publication(tmp_path):
    dem = _dem()
    dem.valid[50, 54] = False
    crops = type("Crops", (), {"near": _crops(dem)[0], "mid": None, "far": None})()
    with pytest.raises(NearFieldUnavailable, match="3x3 median-filter"):
        generate_tier_a_mask(
            SITE_ID,
            crops,
            output_root=tmp_path / "terrain",
            geometric_growth_factor=1.5,
        )
    assert not (tmp_path / "terrain" / "masks" / f"{SITE_ID}.bin").exists()
    assert not (tmp_path / "terrain" / "masks" / f"{SITE_ID}.json").exists()


def test_missing_plane_fit_samples_blocks_publication(tmp_path):
    dem = _dem()
    dem.valid[30:71, 30:71] = False
    crops = type("Crops", (), {"near": _crops(dem)[0], "mid": None, "far": None})()
    with pytest.raises(NearFieldUnavailable, match="7x7 plane-fit"):
        generate_tier_a_mask(
            SITE_ID,
            crops,
            output_root=tmp_path / "terrain",
            geometric_growth_factor=1.5,
        )
    assert not (tmp_path / "terrain" / "masks" / f"{SITE_ID}.bin").exists()
    assert not (tmp_path / "terrain" / "masks" / f"{SITE_ID}.json").exists()


@pytest.mark.parametrize("commit", [None, "not-a-commit", "a" * 39, "g" * 40])
def test_missing_or_invalid_commit_rejects_publication(monkeypatch, tmp_path, commit):
    crops = type(
        "Crops",
        (),
        {
            "near": _crops(_dem())[0],
            "mid": None,
            "far": None,
        },
    )()
    monkeypatch.setattr("lumen_pipeline.terrain.masks._git_commit", lambda: commit)
    with pytest.raises(ValueError, match="40-character"):
        generate_tier_a_mask(
            SITE_ID,
            crops,
            output_root=tmp_path / "terrain",
            geometric_growth_factor=1.5,
        )


def test_near_zone_tie_preserves_dem_distance_and_negative_dem_is_clamped():
    from lumen_pipeline.terrain.masks import NearFieldModel

    near = NearFieldModel(
        z0_m=0.0,
        slope_deg=0.0,
        downhill_aspect_deg=180.0,
        uphill_azimuth_deg=0.0,
        d_min_m=15.0,
        near_field_resolution_m=5.0,
        median_filter_status="applied",
        median_filter_reason=None,
        median_filter_radius_m=100.0,
        median_filter_kernel_px=(3, 3),
        plane_fit_k=3,
        plane_fit_half_width_m=15.0,
        filtered_elevation=np.zeros((1, 1)),
    )
    elevation = np.zeros((4, 1), dtype=np.float32)
    distance = np.full((4, 1), 10.0, dtype=np.float32)
    _apply_near_zone(elevation, distance, near, (1.0, 2.0, 5.0, 10.0), np.array([0.0]))
    assert np.all(distance == 10.0)

    elevation.fill(-1.0)
    distance.fill(10.0)
    _apply_near_zone(elevation, distance, near, (1.0, 2.0, 5.0, 10.0), np.array([0.0]))
    assert np.all(elevation == 0.0)
    assert np.all(distance == 0.015)
