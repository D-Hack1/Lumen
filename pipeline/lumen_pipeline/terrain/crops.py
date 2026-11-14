"""Deterministic multi-resolution terrain crop selection and reads."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

from .dem_io import DemProduct, DemReader, DemWindow, load_products


class CropCoverageError(RuntimeError):
    """Raised when a requested crop has no verified covered source."""


@dataclass(frozen=True)
class CropSpec:
    """One deterministic crop interval and its ordered source candidates."""

    name: str
    min_distance_km: float
    max_distance_km: float
    source_keys: tuple[str, ...]
    preferred_resolution_m: float


@dataclass(frozen=True)
class TerrainCrop:
    """A read terrain crop and its actual source provenance."""

    spec: CropSpec
    dem: DemWindow
    source_key: str
    source_resolution_m: float
    source_url: str

    @property
    def achieved_resolution_m(self) -> float:
        return min(abs(value) for value in self.dem.resolution_m)


@dataclass(frozen=True)
class TerrainCrops:
    """Near, mid, and far crops, preserving unavailable intervals explicitly."""

    site_id: str
    latitude_deg: float
    longitude_deg_east: float
    near: TerrainCrop | None
    mid: TerrainCrop | None
    far: TerrainCrop | None
    unavailable: Mapping[str, str]

    def for_distance_km(self, distance_km: float) -> TerrainCrop:
        """Select the crop owning a distance, rejecting unavailable coverage."""

        crops = tuple(crop for crop in (self.near, self.mid, self.far) if crop is not None)
        for index, crop in enumerate(crops):
            upper_inclusive = index == len(crops) - 1
            in_range = crop.spec.min_distance_km <= distance_km and (
                distance_km <= crop.spec.max_distance_km
                if upper_inclusive
                else distance_km < crop.spec.max_distance_km
            )
            if in_range:
                return crop
        raise CropCoverageError(f"no available terrain crop covers {distance_km} km")

    @property
    def near_field_resolution_m(self) -> float:
        if self.near is None:
            raise CropCoverageError("near-field terrain crop is unavailable")
        return self.near.achieved_resolution_m


_CROP_SPECS = (
    CropSpec(
        "near",
        0.0,
        5.0,
        ("site_specific_5m_lola_pgda_78", "polar_5m_lola_pgda_81"),
        5.0,
    ),
    CropSpec("mid", 5.0, 80.0, ("polar_20m_lola_pgda_90",), 20.0),
    CropSpec("far", 80.0, 250.0, ("regional_240m_lola_pgda_90",), 240.0),
)


def _latitude_coverage(value: str | None) -> tuple[float, float] | None:
    if not value:
        return None
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)S\s*-\s*(\d+(?:\.\d+)?)S\s*", value)
    if match is None:
        return None
    first, second = (float(part) for part in match.groups())
    return -max(first, second), -min(first, second)


def _covers(product: DemProduct, latitude_deg: float) -> bool:
    coverage = _latitude_coverage(product.latitude_coverage)
    return coverage is not None and coverage[0] <= latitude_deg <= coverage[1]


def _select_product(
    spec: CropSpec,
    products: Mapping[str, DemProduct],
    latitude_deg: float,
) -> DemProduct:
    for key in spec.source_keys:
        product = products.get(key)
        if product is not None and product.is_verified and _covers(product, latitude_deg):
            return product
    raise CropCoverageError(
        f"{spec.name} crop has no verified source covering latitude {latitude_deg}"
    )


def build_crops(
    site_id: str,
    *,
    latitude_deg: float,
    longitude_deg_east: float,
    reader: DemReader,
    products: Mapping[str, DemProduct] | None = None,
    allow_unavailable: bool = True,
) -> TerrainCrops:
    """Read nested crops using ordered, verified source candidates.

    A missing or unverified source is recorded in ``unavailable`` and is never
    replaced by a coarser product. Set ``allow_unavailable=False`` when a
    complete three-crop run is required.
    """

    selected_products = products if products is not None else load_products()
    crops: dict[str, TerrainCrop | None] = {}
    unavailable: dict[str, str] = {}
    for spec in _CROP_SPECS:
        try:
            product = _select_product(spec, selected_products, latitude_deg)
            dem = reader.read_site_window(
                product,
                lon_deg=longitude_deg_east,
                lat_deg=latitude_deg,
                width_m=2.0 * spec.max_distance_km * 1000.0,
                height_m=2.0 * spec.max_distance_km * 1000.0,
            )
            crops[spec.name] = TerrainCrop(
                spec=spec,
                dem=dem,
                source_key=product.key,
                source_resolution_m=product.resolution_m,
                source_url=product.url,
            )
        except (CropCoverageError, OSError, ValueError, RuntimeError) as exc:
            if not allow_unavailable:
                raise
            crops[spec.name] = None
            unavailable[spec.name] = str(exc)
    return TerrainCrops(
        site_id=site_id,
        latitude_deg=latitude_deg,
        longitude_deg_east=longitude_deg_east,
        near=crops["near"],
        mid=crops["mid"],
        far=crops["far"],
        unavailable=unavailable,
    )
