"""Focused S-5 site ladders and fail-closed production tests."""

from __future__ import annotations

import numpy as np
import pytest
from pyproj import CRS, Transformer
from rasterio.transform import from_origin

from lumen_pipeline.terrain.crops import (
    CropCoverageError,
    CropSpec,
    TerrainCrop,
    _crop_specs,
    build_crops,
)
from lumen_pipeline.terrain.dem_io import (
    LUNAR_SPHERICAL_CRS,
    DemProduct,
    DemWindow,
    load_products,
)
from lumen_pipeline.terrain.horizon import HorizonResult
from lumen_pipeline.terrain.masks import (
    _site,
    _site_coordinates,
    generate_tier_a_mask,
)

CY3_LATITUDE = -69.373
CY3_LONGITUDE = 32.319


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
        metadata={"synthetic_test_product": True},
    )


def _dem(latitude: float = CY3_LATITUDE, longitude: float = CY3_LONGITUDE) -> DemWindow:
    crs = CRS.from_proj4(
        f"+proj=aeqd +lat_0={latitude} +lon_0={longitude} +R=1737400 +units=m +no_defs"
    )
    transformer = Transformer.from_crs(LUNAR_SPHERICAL_CRS, crs, always_xy=True)
    site_x, site_y = transformer.transform(longitude, latitude)
    bounds = (site_x - 300_000.0, site_y - 300_000.0, site_x + 300_000.0, site_y + 300_000.0)
    return DemWindow(
        elevation=np.zeros((101, 101), dtype=np.float32),
        valid=np.ones((101, 101), dtype=bool),
        transform=from_origin(site_x - 252.5, site_y + 252.5, 5.0, 5.0),
        crs=crs,
        bounds=bounds,
        resolution_m=(5.0, 5.0),
        source="synthetic",
        provenance={"source_bounds": list(bounds), "synthetic": True},
    )


class _Reader:
    def __init__(self, dem: DemWindow) -> None:
        self.dem = dem

    def read_site_window(self, product, *, lon_deg, lat_deg, width_m, height_m):
        return self.dem


def test_cy3_ladder_prefers_dedicated_then_mid_then_regional():
    """Use explicitly marked synthetic products; this does not verify production sources."""

    specs = _crop_specs("cy3_shiv_shakti")
    assert specs[0].source_keys == (
        "chandrayaan3_lroc_vikramsite_dtm",
        "chandrayaan3_lola_30m_pgda_90",
        "regional_240m_lola_pgda_90",
    )
    assert specs[1].source_keys == (
        "chandrayaan3_lola_30m_pgda_90",
        "regional_240m_lola_pgda_90",
    )

    products = {
        "chandrayaan3_lroc_vikramsite_dtm": _product(
            "chandrayaan3_lroc_vikramsite_dtm", 3.0, "60S-75S"
        ),
        "chandrayaan3_lola_30m_pgda_90": _product("chandrayaan3_lola_30m_pgda_90", 30.0, "60S-75S"),
        "regional_240m_lola_pgda_90": _product("regional_240m_lola_pgda_90", 240.0, "60S-90S"),
    }
    crops = build_crops(
        "cy3_shiv_shakti",
        latitude_deg=CY3_LATITUDE,
        longitude_deg_east=CY3_LONGITUDE,
        reader=_Reader(_dem()),
        products=products,
        allow_unavailable=False,
    )

    assert crops.near is not None
    assert crops.mid is not None
    assert crops.far is not None
    assert crops.near.source_key == "chandrayaan3_lroc_vikramsite_dtm"
    assert crops.mid.source_key == "chandrayaan3_lola_30m_pgda_90"
    assert crops.far.source_key == "regional_240m_lola_pgda_90"
    assert all(crop.dem.provenance["synthetic"] for crop in (crops.near, crops.mid, crops.far))


def test_cy3_ladder_falls_back_to_regional_only_when_verified():
    """Exercise fallback ordering with synthetic products only."""

    products = {
        "regional_240m_lola_pgda_90": _product("regional_240m_lola_pgda_90", 240.0, "60S-90S")
    }
    crops = build_crops(
        "cy3_shiv_shakti",
        latitude_deg=CY3_LATITUDE,
        longitude_deg_east=CY3_LONGITUDE,
        reader=_Reader(_dem()),
        products=products,
        allow_unavailable=False,
    )
    assert crops.near is not None
    assert crops.mid is not None
    assert crops.far is not None
    assert {crop.source_key for crop in (crops.near, crops.mid, crops.far)} == {
        "regional_240m_lola_pgda_90"
    }


def test_registered_sites_use_authoritative_coordinates_and_no_invented_artemis_region_id():
    site = _site("cy3_shiv_shakti")
    assert _site_coordinates("cy3_shiv_shakti", site) == (CY3_LATITUDE, CY3_LONGITUDE)
    im2 = _site("im2_athena")
    assert im2["verification_status"] == "verified"
    assert im2["program"] == "CLPS IM-2"
    with pytest.raises(KeyError):
        _site("artemis_region")


def test_s4_partial_crop_mask_behavior_remains_default(monkeypatch, tmp_path):
    dem = _dem(-84.7906, 29.1957)
    crop = TerrainCrop(
        spec=CropSpec("near", 0.0, 5.0, ("synthetic_test_near",), 5.0),
        dem=dem,
        source_key="synthetic_test_near",
        source_resolution_m=5.0,
        source_url="https://example.invalid/synthetic_test_near.tif",
    )
    crops = type("Crops", (), {"near": crop, "mid": None, "far": None})()

    def fake_raycast(*args, **kwargs):
        return HorizonResult(
            np.zeros((4, 3600), dtype=np.float32),
            np.ones((4, 3600), dtype=np.float32),
            (np.arange(3600) + 0.5) * 0.1,
            (1.0, 2.0, 5.0, 10.0),
            0.1,
            15.0,
            250.0,
        )

    monkeypatch.setattr("lumen_pipeline.terrain.masks._git_commit", lambda: "a" * 40)
    monkeypatch.setattr("lumen_pipeline.terrain.masks.raycast_horizon", fake_raycast)
    artifact = generate_tier_a_mask(
        "im2_athena",
        crops,
        output_root=tmp_path / "terrain",
        geometric_growth_factor=1.5,
    )
    assert artifact.binary_path.exists()

    with pytest.raises(CropCoverageError, match="complete near/mid/far"):
        generate_tier_a_mask(
            "im2_athena",
            crops,
            output_root=tmp_path / "strict-terrain",
            geometric_growth_factor=1.5,
            require_complete_crops=True,
        )


def test_s5_shackleton_requires_complete_crops_by_default(monkeypatch, tmp_path):
    dem = _dem(-89.54, 129.0)
    crop = TerrainCrop(
        spec=CropSpec("near", 0.0, 5.0, ("synthetic_test_near",), 5.0),
        dem=dem,
        source_key="synthetic_test_near",
        source_resolution_m=5.0,
        source_url="https://example.invalid/synthetic_test_near.tif",
    )
    crops = type("Crops", (), {"near": crop, "mid": None, "far": None})()

    monkeypatch.setattr("lumen_pipeline.terrain.masks._git_commit", lambda: "a" * 40)

    with pytest.raises(CropCoverageError, match="complete near/mid/far"):
        generate_tier_a_mask(
            "shackleton_ridge",
            crops,
            output_root=tmp_path / "terrain",
            geometric_growth_factor=1.5,
        )


def test_production_dem_registry_blocks_unresolved_s5_sources():
    products = load_products()
    assert "chandrayaan3_lroc_vikramsite_dtm" not in products
    assert "chandrayaan3_lola_30m_pgda_90" not in products
    assert "regional_240m_lola_pgda_90" not in products
    assert "polar_5m_lola_pgda_81" not in products


@pytest.mark.parametrize(
    ("site_id", "latitude", "longitude"),
    [
        ("shackleton_ridge", -89.54, 129.0),
        ("cy3_shiv_shakti", CY3_LATITUDE, CY3_LONGITUDE),
    ],
)
def test_s5_production_crops_remain_blocked_without_verified_sources(site_id, latitude, longitude):
    crops = build_crops(
        site_id,
        latitude_deg=latitude,
        longitude_deg_east=longitude,
        reader=_Reader(_dem()),
        products=load_products(),
    )
    assert crops.near is None
    assert crops.mid is None
    assert crops.far is None
    assert set(crops.unavailable) == {"near", "mid", "far"}
