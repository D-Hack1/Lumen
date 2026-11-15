"""Reference-pixel sampling for the G5 PGDA map comparison."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

import rasterio
import yaml
from pyproj import CRS, Transformer

ROOT = Path(__file__).resolve().parents[3]
REFERENCE_MAPS = {
    "average_solar_illumination": ROOT
    / "pipeline"
    / "data"
    / "validation"
    / "pgda"
    / "AVGVISIB_85S_060M_201608.tiff",
    "earth_visibility": ROOT
    / "pipeline"
    / "data"
    / "validation"
    / "pgda"
    / "AVGVISIB_85S_060M_201608_EARTH.tiff",
}
SOURCE_METADATA_KEYS = {
    "average_solar_illumination": "avg_illumination_85S_60m_pgda_69",
    "earth_visibility": "earth_visibility_85S_60m_pgda_69",
}


class CoordinateOutsideMapError(ValueError):
    """Raised when a site coordinate does not intersect the reference raster."""


def _portable_path(path: str | Path) -> str:
    resolved = Path(path).resolve()
    try:
        return resolved.relative_to(ROOT).as_posix()
    except ValueError:
        return f"external/{resolved.name}"


def _source_metadata() -> dict[str, dict[str, Any]]:
    config_path = ROOT / "pipeline" / "config" / "dem_sources.yaml"
    payload = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    products = payload["regional_layer_products"]
    fields = (
        "provider",
        "product_id",
        "source_page",
        "url",
        "citation",
        "resolution_m",
        "latitude_coverage",
        "crs",
        "scale",
        "offset",
        "nodata",
        "value_meaning",
    )
    return {
        product: {field: products[source_key][field] for field in fields}
        for product, source_key in SOURCE_METADATA_KEYS.items()
    }


def _validate_latitude_coverage(latitude_deg: float, coverage: str) -> None:
    southern_edge, northern_edge = coverage.split("-", maxsplit=1)
    if not southern_edge.endswith("S") or not northern_edge.endswith("S"):
        raise ValueError(f"unsupported PGDA latitude coverage: {coverage}")
    north_deg = -float(southern_edge[:-1])
    south_deg = -float(northern_edge[:-1])
    if not south_deg <= latitude_deg <= north_deg:
        raise CoordinateOutsideMapError(
            f"site latitude is outside the documented PGDA coverage {coverage}"
        )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sample_pgda_pixel(
    path: str | Path,
    latitude_deg: float,
    longitude_deg_east: float,
    *,
    latitude_coverage: str | None = None,
) -> dict[str, Any]:
    """Sample the containing native PGDA pixel without resampling."""
    raster_path = Path(path)
    if not math.isfinite(latitude_deg) or not -90.0 <= latitude_deg <= 90.0:
        raise ValueError("latitude_deg must be finite and in [-90, 90]")
    if not math.isfinite(longitude_deg_east):
        raise ValueError("longitude_deg_east must be finite")
    if latitude_coverage is not None:
        _validate_latitude_coverage(latitude_deg, latitude_coverage)

    lunar_geographic = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs +type=crs")
    with rasterio.open(raster_path) as dataset:
        if dataset.count != 1 or dataset.crs is None:
            raise ValueError("PGDA map must have one band and a defined CRS")
        transformer = Transformer.from_crs(lunar_geographic, dataset.crs, always_xy=True)
        x_m, y_m = transformer.transform(longitude_deg_east, latitude_deg)
        row, column = dataset.index(x_m, y_m)
        if not (0 <= row < dataset.height and 0 <= column < dataset.width):
            raise CoordinateOutsideMapError(f"site coordinate is outside the PGDA map: {raster_path}")

        raw_value = dataset.read(1, window=((row, row + 1), (column, column + 1)))[0, 0].item()
        nodata = dataset.nodata
        is_nodata = nodata is not None and raw_value == nodata
        scale = float(dataset.scales[0])
        offset = float(dataset.offsets[0])
        if not math.isfinite(scale) or not math.isfinite(offset):
            raise ValueError("PGDA map scale and offset must be finite")
        pixel_x_m, pixel_y_m = dataset.xy(row, column)
        sample = {
            "path": _portable_path(raster_path),
            "sha256": _sha256(raster_path),
            "product_id": dataset.tags().get("PRODUCT_ID"),
            "data_set_id": dataset.tags().get("DATA_SET_ID"),
            "shape": [dataset.height, dataset.width],
            "crs": dataset.crs.to_wkt(),
            "transform": list(dataset.transform),
            "scale": scale,
            "offset": offset,
            "nodata": nodata,
            "raw_value": raw_value,
            "fraction": None if is_nodata else raw_value * scale + offset,
            "status": "NODATA" if is_nodata else "SAMPLED",
            "pixel": {
                "row": row,
                "column": column,
                "center_x_m": pixel_x_m,
                "center_y_m": pixel_y_m,
                "site_x_m": x_m,
                "site_y_m": y_m,
                "center_offset_m": math.hypot(pixel_x_m - x_m, pixel_y_m - y_m),
            },
        }
    return sample


def build_g5_gate(
    *,
    reference_maps: dict[str, str | Path] | None = None,
    sites_path: str | Path | None = None,
    mask_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Report available PGDA reference samples without claiming a comparison."""
    maps = REFERENCE_MAPS if reference_maps is None else reference_maps
    sites_file = Path(sites_path) if sites_path is not None else ROOT / "pipeline" / "config" / "sites.yaml"
    masks = Path(mask_dir) if mask_dir is not None else ROOT / "web" / "public" / "data" / "terrain" / "masks"
    if not sites_file.is_file():
        sites: list[dict[str, Any]] = []
        missing_inputs = [_portable_path(sites_file)]
    else:
        payload = yaml.safe_load(sites_file.read_text(encoding="utf-8"))
        sites = payload.get("sites", [])
        missing_inputs = []

    references: dict[str, dict[str, Any]] = {}
    comparisons: list[dict[str, Any]] = []
    source_metadata = _source_metadata()
    for product, raw_path in maps.items():
        path = Path(raw_path)
        references[product] = {"source_metadata": source_metadata[product]}
        if not path.is_file():
            missing_inputs.append(_portable_path(path))
            continue
        references[product].update({"path": _portable_path(path), "sha256": _sha256(path)})
        for site in sites:
            if site.get("verification_status") != "verified" or site.get("tier") != "A":
                continue
            site_id = site["id"]
            try:
                sample = sample_pgda_pixel(
                    path,
                    float(site["latitude_deg"]),
                    float(site["longitude_deg_east"]),
                    latitude_coverage=source_metadata[product]["latitude_coverage"],
                )
            except CoordinateOutsideMapError:
                continue
            if sample["status"] == "NODATA":
                continue
            mask_json = masks / f"{site_id}.json"
            mask_bin = masks / f"{site_id}.bin"
            if not mask_json.is_file() or not mask_bin.is_file():
                missing_inputs.extend(
                    _portable_path(mask_path)
                    for mask_path in (mask_json, mask_bin)
                    if not mask_path.is_file()
                )
                continue
            mask_metadata = json.loads(mask_json.read_text(encoding="utf-8"))
            if mask_metadata.get("site_id") != site_id:
                raise ValueError(f"terrain mask metadata does not match site {site_id}")
            mask_heights = [float(height) for height in mask_metadata.get("heights_m", [])]
            comparisons.append(
                {
                    "site_id": site_id,
                    "product": product,
                    "latitude_deg": float(site["latitude_deg"]),
                    "longitude_deg_east": float(site["longitude_deg_east"]),
                    "terrain_mask_heights_m": mask_heights,
                    "reference_fraction": sample["fraction"],
                    "computed_fraction": None,
                    "absolute_error_fraction": None,
                    "status": "BLOCKED",
                    "reference_sample": sample,
                }
            )

    blockers = [
        "No independent LUMEN multi-year average values are available for the sampled pixels.",
        "The G5 criterion says 'within a few percent' but gives no numeric tolerance.",
        "PGDA documents an hourly average over an approximately 18.6-year lunar nutation cycle; the matching LUMEN aggregation interval is unresolved.",
        "The shared observer-height and solar-disc conventions are unresolved; PGDA Earth visibility counts any part of the Earth disc above local LOLA topography.",
    ]
    if missing_inputs:
        blockers.append("One or more required local PGDA raster, site, or co-located mask inputs are missing.")
    if not comparisons:
        blockers.append("No co-located Tier-A mask-backed sites and valid PGDA pixels were available.")
    elif any(0.0 not in comparison["terrain_mask_heights_m"] for comparison in comparisons):
        blockers.append("The local Tier-A mask has no 0 m observer-height horizon for a surface-pixel comparison.")

    if missing_inputs:
        reason = "Required PGDA, site, or co-located mask inputs are missing; no complete G5 comparison was performed."
    elif comparisons:
        reason = "PGDA reference samples are recorded, but no defensible LUMEN comparison can be evaluated yet."
    elif references:
        reason = "PGDA rasters are available, but no co-located Tier-A mask-backed pixels were sampled."
    else:
        reason = "PGDA reference rasters are unavailable; no G5 comparison was performed."

    return {
        "id": "G5",
        "description": "Multi-year averages versus independent PGDA map pixels",
        "status": "BLOCKED",
        "criterion": "within a few percent; differences explained",
        "reason": reason,
        "reference_maps": references,
        "comparisons": comparisons,
        "missing_inputs": sorted(set(missing_inputs)),
        "blockers": blockers,
        "required_artifacts": [
            "Independent LUMEN average-illumination and Earth-visibility values at matching map pixels",
            "A contract-defined temporal window and visibility convention",
            "A numeric G5 tolerance",
        ],
    }
