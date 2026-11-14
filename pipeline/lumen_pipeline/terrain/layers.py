"""Verified terrain-layer inspection, export, and indexing.

This module deliberately does not derive illumination, Earth visibility, slope
hazard, or PSR classifications from unrelated terrain artifacts. Callers must
provide an independently verified raster and its interpretation metadata.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import rasterio

# These are the two extents consumed by the frontend and frozen in
# data_terrain_misc.md §5.2.
LAYER_IDS = ("illumination", "earth_visibility", "slope_hazard", "psr")
EXTENTS = ("80_90S", "85_90S")


class LayerInputError(ValueError):
    """Raised when a layer input lacks safe, explicit metadata."""


@dataclass(frozen=True)
class RasterLayerMetadata:
    """Metadata required to export a visualization-ready raster without guessing."""

    layer_id: str
    name: str
    extent: str
    source: str
    units: str
    value_semantics: str
    nodata: float | int | None
    projection: dict[str, Any]
    source_citation: str
    spatial_metadata: dict[str, Any]
    encoding: str
    encoding_parameters: dict[str, Any]
    legend_stops: list[dict[str, Any]]
    processing: str = "none"


def inspect_raster(path: Path) -> dict[str, Any]:
    """Return source raster metadata without changing or resampling the raster."""

    path = Path(path)
    if not path.is_file():
        raise LayerInputError(f"layer source does not exist: {path}")
    with rasterio.open(path) as dataset:
        if dataset.count not in (1, 2):
            raise LayerInputError(
                f"layer raster must have one value band and optional alpha band: {path}"
            )
        return {
            "path": str(path),
            "shape": [dataset.height, dataset.width],
            "dtype": dataset.dtypes[0],
            "crs": dataset.crs.to_string() if dataset.crs else None,
            "transform": list(dataset.transform),
            "bounds": list(dataset.bounds),
            "resolution": [abs(dataset.res[0]), abs(dataset.res[1])],
            "nodata": dataset.nodata,
            "units": dataset.units[0],
            "band_count": dataset.count,
            "validity_band": 2 if dataset.count == 2 else None,
        }


def _validate_metadata(metadata: RasterLayerMetadata) -> None:
    if metadata.layer_id not in LAYER_IDS:
        raise LayerInputError(f"unsupported terrain layer: {metadata.layer_id}")
    if metadata.extent not in EXTENTS:
        raise LayerInputError(f"unsupported terrain extent: {metadata.extent}")
    if not metadata.source.strip() or not metadata.value_semantics.strip():
        raise LayerInputError("source and value semantics are required")
    if not metadata.source_citation.strip():
        raise LayerInputError("source citation is required")
    if metadata.encoding != "pre_encoded_integer":
        raise LayerInputError("encoding must be pre_encoded_integer")
    if metadata.encoding_parameters.get("kind") != "identity":
        raise LayerInputError("encoding parameters must declare identity mapping")
    if not metadata.legend_stops:
        raise LayerInputError("legend stops are required for frontend interpretation")
    required_projection = {
        "size_px",
        "centre_px",
        "lat_limit_deg",
        "half_extent_km",
        "metres_per_px",
    }
    if not required_projection.issubset(metadata.projection):
        missing = sorted(required_projection - metadata.projection.keys())
        raise LayerInputError(f"projection metadata is missing fields: {', '.join(missing)}")
    required_spatial = {
        "crs",
        "transform",
        "bounds",
        "resolution",
        "shape",
        "coordinate_convention",
    }
    if not required_spatial.issubset(metadata.spatial_metadata):
        missing = sorted(required_spatial - metadata.spatial_metadata.keys())
        raise LayerInputError(f"spatial metadata is missing fields: {', '.join(missing)}")
    spatial = metadata.spatial_metadata
    if not isinstance(spatial["crs"], str) or not spatial["crs"].strip():
        raise LayerInputError("spatial CRS must be a non-empty string")
    if (
        not isinstance(spatial["shape"], list)
        or len(spatial["shape"]) != 2
        or any(not isinstance(value, int) or value <= 0 for value in spatial["shape"])
    ):
        raise LayerInputError("spatial shape must contain two positive integers")
    for field, length in (("transform", (6, 9)), ("bounds", (4,)), ("resolution", (2,))):
        values = spatial[field]
        if (
            not isinstance(values, list)
            or len(values) not in length
            or any(
                not isinstance(value, (int, float)) or not math.isfinite(float(value))
                for value in values
            )
        ):
            raise LayerInputError(f"spatial {field} must contain finite numeric values")
    if any(value <= 0 for value in spatial["resolution"]):
        raise LayerInputError("spatial resolution must be positive")
    if (
        not isinstance(spatial["coordinate_convention"], str)
        or not spatial["coordinate_convention"].strip()
    ):
        raise LayerInputError("coordinate convention must be a non-empty string")
    projection = metadata.projection
    numeric_projection = (
        ("radius_m", 1_737_400.0),
        ("central_meridian_deg", 0.0),
        ("standard_parallel_deg", -90.0),
    )
    for field, expected in numeric_projection:
        value = projection.get(field)
        if not isinstance(value, (int, float)) or not math.isclose(
            float(value), expected, abs_tol=1e-9
        ):
            raise LayerInputError(f"projection {field} is not the shared south-polar value")
    size = projection["size_px"]
    if not isinstance(size, list) or len(size) != 2 or size != spatial["shape"]:
        raise LayerInputError("projection size_px must match spatial shape")
    for field in ("centre_px",):
        values = projection[field]
        if (
            not isinstance(values, list)
            or len(values) != 2
            or any(
                not isinstance(value, (int, float)) or not math.isfinite(float(value))
                for value in values
            )
        ):
            raise LayerInputError(f"projection {field} must contain finite numeric values")
    for field in ("lat_limit_deg", "half_extent_km", "metres_per_px"):
        value = projection[field]
        if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise LayerInputError(f"projection {field} must be finite")
    if (
        projection["lat_limit_deg"] not in (-80, -85)
        or projection["half_extent_km"] <= 0
        or projection["metres_per_px"] <= 0
    ):
        raise LayerInputError("projection extent values are invalid")
    if any(
        not isinstance(value, (int, float)) or not math.isfinite(float(value))
        for value in metadata.projection.values()
        if isinstance(value, (int, float))
    ):
        raise LayerInputError("projection metadata contains a non-finite numeric value")


def export_layer_png(
    values: np.ndarray,
    output_path: Path,
    *,
    metadata: RasterLayerMetadata,
    source_metadata: dict[str, Any],
    index_directory: Path,
) -> dict[str, Any]:
    """Write an explicitly encoded single-band PNG and return its index entry.

    PNG export accepts integer values only. This avoids silently quantizing
    scientific floating-point layers; callers must encode values explicitly
    and document that encoding in ``value_semantics``.
    """

    _validate_metadata(metadata)
    values = np.asarray(values)
    for field in ("shape", "crs", "transform", "bounds", "resolution", "nodata"):
        expected = metadata.spatial_metadata.get(field)
        actual = source_metadata.get(field)
        if expected != actual:
            raise LayerInputError(f"spatial metadata does not match source raster: {field}")
    if values.ndim != 2 or values.dtype.kind not in "u":
        raise LayerInputError("PNG values must be a two-dimensional unsigned integer array")
    if list(values.shape) != list(metadata.spatial_metadata["shape"]):
        raise LayerInputError("spatial metadata shape does not match PNG values")
    if metadata.encoding_parameters.get("dtype") != values.dtype.name:
        raise LayerInputError("encoding dtype does not match the supplied array")
    if metadata.nodata is not None and not np.isfinite(float(metadata.nodata)):
        raise LayerInputError("nodata must be finite when supplied")
    dtype_info = np.iinfo(values.dtype)
    if metadata.nodata is not None and not (
        dtype_info.min <= metadata.nodata <= dtype_info.max and float(metadata.nodata).is_integer()
    ):
        raise LayerInputError("nodata is not representable by the PNG dtype")
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    nodata_mask = (
        np.zeros(values.shape, dtype=bool) if metadata.nodata is None else values == metadata.nodata
    )
    with rasterio.open(
        output_path,
        "w",
        driver="PNG",
        height=values.shape[0],
        width=values.shape[1],
        count=2,
        dtype=values.dtype,
    ) as dataset:
        dataset.write(values, 1)
        dataset.write(np.where(nodata_mask, 0, 255).astype(values.dtype), 2)
    metadata_path = output_path.with_name(output_path.name + ".json")
    sidecar = {
        "layer_id": metadata.layer_id,
        "extent": metadata.extent,
        "source": metadata.source,
        "source_citation": metadata.source_citation,
        "units": metadata.units,
        "value_semantics": metadata.value_semantics,
        "nodata": metadata.nodata,
        "encoding": metadata.encoding,
        "processing": metadata.processing,
        **metadata.spatial_metadata,
    }
    index_directory = Path(index_directory).resolve()
    try:
        file_path = Path(output_path).resolve().relative_to(index_directory).as_posix()
        metadata_file_path = metadata_path.resolve().relative_to(index_directory).as_posix()
    except ValueError as error:
        raise LayerInputError("output files must be inside the layer index directory") from error
    metadata_path.write_text(json.dumps(sidecar, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {
        "layer_id": metadata.layer_id,
        "name": metadata.name,
        "extent": metadata.extent,
        "filename": output_path.name,
        "file_path": file_path,
        "metadata_filename": metadata_path.name,
        "metadata_path": metadata_file_path,
        "available": True,
        "source": metadata.source,
        "source_citation": metadata.source_citation,
        "units": metadata.units,
        "nodata": metadata.nodata,
        "value_semantics": metadata.value_semantics,
        "projection": metadata.projection,
        "legend_stops": metadata.legend_stops,
        "processing": metadata.processing,
        "spatial_metadata": metadata.spatial_metadata,
        "encoding": metadata.encoding,
        "dtype": str(values.dtype),
    }


def unavailable_layer_entry(
    layer_id: str,
    extent: str,
    *,
    reason: str,
) -> dict[str, Any]:
    """Build an honest index entry for an unavailable production input."""

    if layer_id not in LAYER_IDS:
        raise LayerInputError(f"unsupported terrain layer: {layer_id}")
    if extent not in EXTENTS:
        raise LayerInputError(f"unsupported terrain extent: {extent}")
    if not reason.strip():
        raise LayerInputError("unavailability reason is required")
    names = {
        "illumination": "Average Illumination",
        "earth_visibility": "Earth Visibility",
        "slope_hazard": "Slope Hazard",
        "psr": "PSR (derived)",
    }
    return {
        "layer_id": layer_id,
        "name": names[layer_id],
        "extent": extent,
        "available": False,
        "status": "unavailable",
        "filename": None,
        "reason": reason,
        "source": None,
        "source_citation": None,
        "projection": None,
        "units": None,
        "nodata": None,
        "value_semantics": None,
    }


def write_layer_index(
    output_path: Path,
    *,
    entries: list[dict[str, Any]],
    version: str = "0.1.0",
) -> Path:
    """Write a layer index and reject entries that claim missing files."""

    for entry in entries:
        if entry.get("available"):
            filename = entry.get("filename")
            if not isinstance(filename, str) or not filename:
                raise LayerInputError("available layer is missing filename")
            file_path = entry.get("file_path")
            metadata_path = entry.get("metadata_path")
            if not isinstance(file_path, str) or not isinstance(metadata_path, str):
                raise LayerInputError("available layer is missing explicit output paths")
            if not (Path(output_path).parent / file_path).is_file():
                raise LayerInputError(f"indexed layer file does not exist: {filename}")
            if not (Path(output_path).parent / metadata_path).is_file():
                raise LayerInputError(f"layer metadata file does not exist: {metadata_path}")
    document = {
        "schema": "layers",
        "version": version,
        "layers": entries,
    }
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return output_path


def write_unavailable_index(output_path: Path, *, reason_by_layer: dict[str, str]) -> Path:
    """Publish the honest S-7 index when verified raster inputs are absent."""

    entries = [
        unavailable_layer_entry(layer_id, extent, reason=reason_by_layer[layer_id])
        for layer_id in LAYER_IDS
        for extent in EXTENTS
    ]
    return write_layer_index(output_path, entries=entries)
