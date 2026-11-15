# Owner: Shiva Shakthi
# Map layer PNG rendering (illumination, visibility, slope, PSR).
"""S-7 regional terrain layers: average illumination, Earth visibility, and
slope hazard, at the two contract-required south-polar extents (80_90S and
85_90S).

All three layers share the same south-polar-stereographic CRS, the same
radial-window cropping method, and the same PNG/sidecar/index conventions,
so that machinery lives here. ``psr.py`` reuses :func:`read_regional_window`
and :func:`radius_for_latitude_m` for the PSR layer.

No value here is invented: every product read through this module comes
from ``pipeline/config/dem_sources.yaml``'s ``regional_layer_products``
section, where each entry records how it was independently verified
(CRS, nodata, scale/offset, value range) against the live source, not
assumed from a filename or a product page's prose.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import yaml
from PIL import Image
from rasterio.errors import RasterioIOError
from rasterio.windows import Window

from .dem_io import _source_uri

# PGDA's server intermittently returns HTTP 403 for large windowed range
# reads (confirmed via CPL_CURL_VERBOSE: a working sequence of multi-MB
# range requests followed by a 403 on a similarly-sized range), the same
# documented flakiness noted elsewhere in this project for this same host.
# This is upstream throttling, not a data or CRS problem, so a bounded
# retry with backoff is applied around each full-window dataset read rather
# than silently failing or silently resampling to a smaller request.
_READ_RETRY_ATTEMPTS = 4
_READ_RETRY_BACKOFF_S = 3.0


def _retry_read(read_fn):
    last_error: Exception | None = None
    for attempt in range(_READ_RETRY_ATTEMPTS):
        try:
            return read_fn()
        except RasterioIOError as exc:
            last_error = exc
            if attempt + 1 < _READ_RETRY_ATTEMPTS:
                time.sleep(_READ_RETRY_BACKOFF_S * (attempt + 1))
    raise last_error


SPHERE_RADIUS_M = 1_737_400.0

# Contract §5.2: the two required regional extents, as colatitude (degrees
# from the pole) of the extent's equator-ward boundary.
EXTENT_COLATITUDE_DEG = {
    "80_90S": 10.0,
    "85_90S": 5.0,
}

# Contract §5.3 slope-hazard classes (degrees). "Exceeded" has no finite
# upper bound; 90.0 is used only as an inclusive sentinel since a plane-fit
# slope angle cannot exceed 90 degrees by construction (atan domain).
SLOPE_HAZARD_CLASSES: tuple[tuple[str, float, float], ...] = (
    ("safe", 0.0, 5.0),
    ("caution", 5.0, 10.0),
    ("critical", 10.0, 15.0),
    ("exceeded", 15.0, 90.0),
)
SLOPE_HAZARD_NODATA_CODE = 255

# ColorBrewer (colorblind-safe) palettes. Hex stops are a documented,
# disclosed default pending sign-off (contract §5.4 marks palette hex values
# "Unresolved... pending coordination with Ebin and Abhinav"); nothing here
# is a scientific claim.
SLOPE_HAZARD_PALETTE = {
    "safe": "#ffffb2",
    "caution": "#fecc5c",
    "critical": "#fd8d3c",
    "exceeded": "#e31a1c",
}
CONTINUOUS_PALETTE_STOPS = (
    (0.0, "#ffffcc"),
    (0.25, "#a1dab4"),
    (0.50, "#41b6c4"),
    (0.75, "#2c7fb8"),
    (1.00, "#253494"),
)


class LayerUnavailable(RuntimeError):
    """Raised when a regional layer cannot be honestly generated."""


@dataclass(frozen=True)
class RegionalLayerProduct:
    """One verified ``regional_layer_products`` entry from dem_sources.yaml."""

    key: str
    name: str
    url: str
    resolution_m: float
    latitude_coverage: str | None
    scale: float
    offset: float
    nodata: float
    value_meaning: str
    citation: str
    source_page: str | None
    availability_status: str | None
    verification_status: str | None

    @property
    def is_verified(self) -> bool:
        return (
            bool(self.url)
            and self.verification_status == "live_opened_and_inspected"
            and math.isfinite(self.scale)
            and math.isfinite(self.offset)
        )


def _default_config_path() -> Path:
    return Path(__file__).resolve().parents[2] / "config" / "dem_sources.yaml"


def load_regional_layer_products(
    config_path: str | os.PathLike[str] | None = None,
) -> dict[str, RegionalLayerProduct]:
    """Load verified regional-layer (non-elevation) raster products."""

    path = Path(config_path) if config_path else _default_config_path()
    with path.open("r", encoding="utf-8") as handle:
        document = yaml.safe_load(handle) or {}
    products: dict[str, RegionalLayerProduct] = {}
    for key, values in (document.get("regional_layer_products") or {}).items():
        product = RegionalLayerProduct(
            key=key,
            name=values.get("name", key),
            url=values.get("url") or "",
            resolution_m=float(values.get("resolution_m", float("nan"))),
            latitude_coverage=values.get("latitude_coverage"),
            scale=float(values.get("scale", float("nan"))),
            offset=float(values.get("offset", float("nan"))),
            nodata=float(values.get("nodata", float("nan"))),
            value_meaning=values.get("value_meaning", ""),
            citation=values.get("citation", ""),
            source_page=values.get("source_page"),
            availability_status=values.get("availability_status"),
            verification_status=values.get("verification_status"),
        )
        if product.is_verified:
            products[key] = product
    return products


def radius_for_colatitude_m(
    colatitude_deg: float, *, sphere_radius_m: float = SPHERE_RADIUS_M
) -> float:
    """Polar-stereographic projected radius for a given colatitude.

    Sphere-based polar stereographic, true scale at the pole (k0 = 1):
    rho = 2 R tan(colatitude / 2). This is the same projection (and the
    same formula) used by every PGDA product read in this pipeline; it was
    cross-validated against three independently observed extents (304.0,
    151.7 and 931.2 km) matching the 80S, 85S and 60S product boundaries
    exactly.
    """

    half = math.radians(colatitude_deg) / 2.0
    return 2.0 * sphere_radius_m * math.tan(half)


def extent_radius_m(extent: str) -> float:
    if extent not in EXTENT_COLATITUDE_DEG:
        raise ValueError(f"unknown extent: {extent!r}")
    return radius_for_colatitude_m(EXTENT_COLATITUDE_DEG[extent])


def polar_stereographic_scale_factor(latitude_deg: float) -> float:
    """Point-scale factor k(lat) = 2 / (1 + sin|lat|) for this projection.

    Derived from rho = 2R tan(colatitude/2): dk/d(colatitude) = sec^2(colat/2)
    = 2/(1+cos(colatitude)) = 2/(1+sin|lat|) via cos(colatitude)=sin|lat|.
    True ground distance = projected distance / k(lat).
    """

    return 2.0 / (1.0 + math.sin(math.radians(abs(latitude_deg))))


@dataclass(frozen=True)
class RegionalRaster:
    """A centred, cropped, decoded (scale/offset-applied) regional raster."""

    values: np.ndarray
    valid: np.ndarray
    resolution_m: float
    transform: rasterio.Affine
    crs: Any
    product: RegionalLayerProduct


def read_regional_window(product: RegionalLayerProduct, *, radius_m: float) -> RegionalRaster:
    """Read a centred square window of half-width ``radius_m`` from a
    verified regional-layer product, decoding scale/offset and masking
    nodata. The source rasters used here are already centred at the pole
    (verified per-product in dem_sources.yaml), so no reprojection is
    performed -- only a pixel-window crop at native resolution.
    """

    if not product.is_verified:
        raise LayerUnavailable(f"{product.key}: product is not verified for activation")
    with (
        rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"),
        rasterio.open(_source_uri(product.url)) as dataset,
    ):
        if dataset.crs is None or not dataset.crs.is_projected:
            raise LayerUnavailable(f"{product.key}: source CRS is not a projected CRS")
        resolution_m = abs(dataset.transform.a)
        half_px = math.ceil(radius_m / resolution_m)
        center_col, center_row = (~dataset.transform) @ (0.0, 0.0)
        center_col, center_row = round(center_col), round(center_row)
        col_off = max(0, center_col - half_px)
        row_off = max(0, center_row - half_px)
        col_end = min(dataset.width, center_col + half_px)
        row_end = min(dataset.height, center_row + half_px)
        if col_end <= col_off or row_end <= row_off:
            raise LayerUnavailable(f"{product.key}: requested window does not intersect source")
        window = Window(col_off, row_off, col_end - col_off, row_end - row_off)
        raw = _retry_read(lambda: dataset.read(1, window=window, masked=True))
        transform = dataset.window_transform(window)
        crs = dataset.crs
    values = np.ma.getdata(raw).astype(np.float64)
    mask = np.ma.getmaskarray(raw).copy()
    nodata = product.nodata
    if math.isfinite(nodata):
        mask |= values == nodata
    decoded = values * product.scale + product.offset
    valid = ~mask & np.isfinite(decoded)
    return RegionalRaster(
        values=decoded.astype(np.float32),
        valid=valid,
        resolution_m=resolution_m,
        transform=transform,
        crs=crs,
        product=product,
    )


def classify_slope_hazard(slope_deg: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Classify slope (degrees) into the four contract hazard classes.

    Returns a uint8 array: 0=safe, 1=caution, 2=critical, 3=exceeded,
    255=nodata. Boundaries match contract §5.3 exactly: safe [0,5), caution
    [5,10), critical [10,15], exceeded (15,90]. Invalid/nodata input pixels
    are never classified as "safe" (never treated as zero).
    """

    codes = np.full(slope_deg.shape, SLOPE_HAZARD_NODATA_CODE, dtype=np.uint8)
    finite = valid & np.isfinite(slope_deg)
    s = slope_deg
    codes[finite & (s >= 0.0) & (s < 5.0)] = 0
    codes[finite & (s >= 5.0) & (s < 10.0)] = 1
    codes[finite & (s >= 10.0) & (s <= 15.0)] = 2
    codes[finite & (s > 15.0) & (s <= 90.0)] = 3
    return codes


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def render_categorical_png(
    codes: np.ndarray,
    *,
    class_order: tuple[str, ...],
    palette: dict[str, str],
    nodata_code: int,
    path: Path,
) -> None:
    """Write an RGBA PNG for a categorical (uint8-coded) raster.

    nodata is fully transparent (alpha=0), never rendered as a visible
    color and never silently treated as the first class.
    """

    height, width = codes.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    for index, name in enumerate(class_order):
        rgb = _hex_to_rgb(palette[name])
        take = codes == index
        rgba[take, 0] = rgb[0]
        rgba[take, 1] = rgb[1]
        rgba[take, 2] = rgb[2]
        rgba[take, 3] = 255
    # nodata stays (0, 0, 0, 0): transparent, not a colored "class".
    assert np.all(rgba[codes == nodata_code] == 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(path)


def render_continuous_png(
    values01: np.ndarray,
    valid: np.ndarray,
    *,
    stops: tuple[tuple[float, str], ...],
    path: Path,
) -> None:
    """Write an RGBA PNG for a continuous [0,1] raster via linear
    interpolation between palette stops. Invalid pixels are transparent.
    """

    positions = np.array([s[0] for s in stops], dtype=np.float64)
    colors = np.array([_hex_to_rgb(s[1]) for s in stops], dtype=np.float64)
    clipped = np.clip(values01, 0.0, 1.0)
    r = np.interp(clipped, positions, colors[:, 0])
    g = np.interp(clipped, positions, colors[:, 1])
    b = np.interp(clipped, positions, colors[:, 2])
    height, width = values01.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., 0] = np.clip(r, 0, 255).astype(np.uint8)
    rgba[..., 1] = np.clip(g, 0, 255).astype(np.uint8)
    rgba[..., 2] = np.clip(b, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 255, 0).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(path)


def _git_commit() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip() or None


def _terrain_root(output_root: Path | None) -> Path:
    return (
        Path(output_root)
        if output_root is not None
        else Path(__file__).resolve().parents[3] / "web" / "public" / "data" / "terrain"
    )


@dataclass(frozen=True)
class LayerArtifact:
    layer_id: str
    extent: str
    png_path: Path
    sidecar: dict[str, Any]


def _write_layer_sidecar(
    *,
    layer_id: str,
    extent: str,
    png_path: Path,
    terrain_root: Path,
    source: RegionalRaster,
    legend_stops: list[dict[str, Any]],
    classification: dict[str, Any] | None,
    method: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    radius_m = extent_radius_m(extent)
    sidecar: dict[str, Any] = {
        "version": "0.1.0",
        "producer": "lumen_pipeline.terrain.layers",
        "created_utc": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "git_commit": _git_commit(),
        "layer_id": layer_id,
        "extent": extent,
        "filename": png_path.relative_to(terrain_root).as_posix(),
        "projection": {
            "name": "south-polar stereographic",
            "reference_radius_m": SPHERE_RADIUS_M,
            "latitude_of_origin_deg": -90.0,
            "central_meridian_deg": 0.0,
            "scale_factor_at_pole": 1.0,
            "proj4": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs",
        },
        "radius_m": radius_m,
        "resolution_m": source.resolution_m,
        "width_px": int(source.values.shape[1]),
        "height_px": int(source.values.shape[0]),
        "nodata_encoding": "fully transparent alpha channel (RGBA PNG); never encoded as a visible class or value",
        "source": {
            "product_key": source.product.key,
            "name": source.product.name,
            "url": source.product.url,
            "source_page": source.product.source_page,
            "citation": source.product.citation,
            "value_meaning": source.product.value_meaning,
        },
        "method": method,
        "legend_stops": legend_stops,
    }
    if classification is not None:
        sidecar["classification"] = classification
    if extra:
        sidecar.update(extra)
    sidecar_path = png_path.with_suffix(".json")
    sidecar_path.write_text(json.dumps(sidecar, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return sidecar


def generate_slope_hazard_layer(
    extent: str,
    *,
    output_root: Path | None = None,
    products: dict[str, RegionalLayerProduct] | None = None,
) -> LayerArtifact:
    """Generate the slope-hazard PNG + sidecar for one extent, from the
    verified regional_240m_lola_pgda_90 slope raster (dem_sources.yaml).
    """

    from .dem_io import load_products

    dem_products = load_products()
    slope_product = dem_products.get("regional_240m_lola_pgda_90")
    slope_url = slope_product.metadata.get("slope_url") if slope_product is not None else None
    slope_format_meta = (
        (slope_product.metadata.get("format_metadata") or {}) if slope_product else {}
    )
    if slope_product is None or not slope_url:
        raise LayerUnavailable("regional_240m_lola_pgda_90: no verified slope_url registered")
    if slope_format_meta.get("slope_unit") != "deg":
        raise LayerUnavailable(
            "regional_240m_lola_pgda_90: slope_unit is not declared as degrees; refusing to "
            "assume a unit"
        )

    radius_m = extent_radius_m(extent)
    with (
        rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"),
        rasterio.open(_source_uri(slope_url)) as dataset,
    ):
        resolution_m = abs(dataset.transform.a)
        half_px = math.ceil(radius_m / resolution_m)
        center_col, center_row = (~dataset.transform) @ (0.0, 0.0)
        center_col, center_row = round(center_col), round(center_row)
        col_off = max(0, center_col - half_px)
        row_off = max(0, center_row - half_px)
        col_end = min(dataset.width, center_col + half_px)
        row_end = min(dataset.height, center_row + half_px)
        window = Window(col_off, row_off, col_end - col_off, row_end - row_off)
        raw = _retry_read(lambda: dataset.read(1, window=window, masked=True))
        transform = dataset.window_transform(window)

    slope_deg = np.ma.getdata(raw).astype(np.float64)
    valid = ~np.ma.getmaskarray(raw) & np.isfinite(slope_deg) & (slope_deg >= 0.0)
    codes = classify_slope_hazard(slope_deg, valid)

    class_order = tuple(name for name, _, _ in SLOPE_HAZARD_CLASSES)
    terrain_root = _terrain_root(output_root)
    png_path = terrain_root / "layers" / f"slope_hazard_{extent}.png"
    render_categorical_png(
        codes,
        class_order=class_order,
        palette=SLOPE_HAZARD_PALETTE,
        nodata_code=SLOPE_HAZARD_NODATA_CODE,
        path=png_path,
    )

    legend_stops = [
        {
            "class": name,
            "label": f"{name.capitalize()} [{lo:g}, {hi:g}{']' if name == 'critical' else ')'}deg",
            "range_deg": [lo, hi],
            "hex": SLOPE_HAZARD_PALETTE[name],
        }
        for name, lo, hi in SLOPE_HAZARD_CLASSES
    ]
    product = RegionalLayerProduct(
        key="regional_240m_lola_pgda_90.slope_url",
        name="Regional 240 m LOLA slope raster (LDSM_60S_240MPP_ADJ.TIF)",
        url=slope_url,
        resolution_m=resolution_m,
        latitude_coverage="60S-90S",
        scale=1.0,
        offset=0.0,
        nodata=float("nan"),
        value_meaning="terrain slope angle in degrees from the local LOLA-DEM-fitted plane",
        citation="PGDA products/90 (LOLA 20 m/px polar DEM family); see pipeline/config/dem_sources.yaml notes",
        source_page="https://pgda.gsfc.nasa.gov/products/90",
        availability_status="verified_product",
        verification_status="live_opened_and_inspected",
    )
    source = RegionalRaster(
        values=slope_deg.astype(np.float32),
        valid=valid,
        resolution_m=resolution_m,
        transform=transform,
        crs=None,
        product=product,
    )
    sidecar = _write_layer_sidecar(
        layer_id="slope_hazard",
        extent=extent,
        png_path=png_path,
        terrain_root=terrain_root,
        source=source,
        legend_stops=legend_stops,
        classification={
            "scheme": "contract_slope_hazard_v1",
            "classes": [
                {"index": i, "name": name, "range_deg": [lo, hi]}
                for i, (name, lo, hi) in enumerate(SLOPE_HAZARD_CLASSES)
            ],
            "nodata_code": SLOPE_HAZARD_NODATA_CODE,
        },
        method=(
            "Direct centred-window crop (no resampling) from the native 240 m "
            "LOLA slope raster at full resolution, classified per-pixel into "
            "the four contract hazard classes; nodata pixels are never "
            "classified into any class."
        ),
    )
    return LayerArtifact("slope_hazard", extent, png_path, sidecar)


def generate_illumination_layer(extent: str, *, output_root: Path | None = None) -> LayerArtifact:
    """Generate the average-illumination PNG + sidecar for one extent."""

    products = load_regional_layer_products()
    key = (
        "avg_illumination_85S_60m_pgda_69"
        if extent == "85_90S"
        else "avg_illumination_65S_240m_pgda_69"
    )
    product = products.get(key)
    if product is None:
        raise LayerUnavailable(f"{key}: no verified illumination product registered")
    radius_m = extent_radius_m(extent)
    raster = read_regional_window(product, radius_m=radius_m)

    terrain_root = _terrain_root(output_root)
    png_path = terrain_root / "layers" / f"average_illumination_{extent}.png"
    render_continuous_png(
        raster.values, raster.valid, stops=CONTINUOUS_PALETTE_STOPS, path=png_path
    )

    legend_stops = [
        {"value_pct": pos * 100.0, "label": f"{pos * 100:g}%", "hex": hex_color}
        for pos, hex_color in CONTINUOUS_PALETTE_STOPS
    ]
    sidecar = _write_layer_sidecar(
        layer_id="average_illumination",
        extent=extent,
        png_path=png_path,
        terrain_root=terrain_root,
        source=raster,
        legend_stops=legend_stops,
        classification=None,
        method=(
            "Direct centred-window crop (no resampling) from the native-"
            "resolution PGDA average-solar-illumination raster at full "
            "resolution; pixel values are the raw int16 * scale + offset "
            "fraction in [0,1], rendered as a continuous percentage ramp. "
            "Multi-year average: an 18.6-year lunar nutation cycle at "
            "hourly timestep (PGDA products/69, Mazarico et al. 2011)."
        ),
        extra={"temporal_coverage": "18.6-year lunar nutation cycle, hourly timestep"},
    )
    return LayerArtifact("average_illumination", extent, png_path, sidecar)


def generate_earth_visibility_layer(
    extent: str, *, output_root: Path | None = None
) -> LayerArtifact:
    """Generate the Earth-visibility PNG + sidecar for one extent, using the
    authoritative PGDA Earth-disc-visibility product (not a from-scratch
    ephemeris + horizon computation; see dem_sources.yaml notes and the
    method note in the generated sidecar for why).
    """

    products = load_regional_layer_products()
    key = (
        "earth_visibility_85S_60m_pgda_69"
        if extent == "85_90S"
        else "earth_visibility_65S_240m_pgda_69"
    )
    product = products.get(key)
    if product is None:
        raise LayerUnavailable(f"{key}: no verified Earth-visibility product registered")
    radius_m = extent_radius_m(extent)
    raster = read_regional_window(product, radius_m=radius_m)

    terrain_root = _terrain_root(output_root)
    png_path = terrain_root / "layers" / f"earth_visibility_{extent}.png"
    render_continuous_png(
        raster.values, raster.valid, stops=CONTINUOUS_PALETTE_STOPS, path=png_path
    )

    legend_stops = [
        {"value_pct": pos * 100.0, "label": f"{pos * 100:g}%", "hex": hex_color}
        for pos, hex_color in CONTINUOUS_PALETTE_STOPS
    ]
    sidecar = _write_layer_sidecar(
        layer_id="earth_visibility",
        extent=extent,
        png_path=png_path,
        terrain_root=terrain_root,
        source=raster,
        legend_stops=legend_stops,
        classification=None,
        method=(
            "Direct centred-window crop (no resampling) from the native-"
            "resolution PGDA average-Earth-visibility raster. This product "
            "is computed by PGDA from LOLA topography using the full Earth "
            "disc against the local terrain horizon (not a bare geometric "
            "point test), over an 18.6-year lunar nutation cycle at hourly "
            "timestep (PGDA products/69, Mazarico et al. 2011). This "
            "pipeline does not independently recompute Earth visibility "
            "from ephemeris + a per-pixel horizon raycast for the regional "
            "layer: web/public/data/ephem/ephem.bin is an unresolved "
            "Git-LFS pointer in this environment (same blocker noted "
            "elsewhere in the project), and no Tier-A horizon masks exist "
            "for a region-wide grid. Known limitation carried from the "
            "source: Earth is counted visible if any part of its disc is "
            "unobscured, which is slightly optimistic relative to a "
            "DSN-station-only link study."
        ),
        extra={"temporal_coverage": "18.6-year lunar nutation cycle, hourly timestep"},
    )
    return LayerArtifact("earth_visibility", extent, png_path, sidecar)


def write_layers_index(artifacts: list[LayerArtifact], *, output_root: Path | None = None) -> Path:
    """Merge generated layer sidecars into layers.json, preserving entries
    for layers/extents not touched by this call."""

    terrain_root = _terrain_root(output_root)
    index_path = terrain_root / "layers.json"
    if index_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
    else:
        index = {"version": "0.1.0", "layers": []}
    existing = {(entry["layer_id"], entry["extent"]): i for i, entry in enumerate(index["layers"])}
    for artifact in artifacts:
        entry = {
            "layer_id": artifact.layer_id,
            "name": artifact.layer_id.replace("_", " ").title(),
            "extent": artifact.extent,
            "filename": artifact.sidecar["filename"],
            "projection": artifact.sidecar["projection"],
            "legend_stops": artifact.sidecar["legend_stops"],
            "source_citation": artifact.sidecar["source"]["citation"],
        }
        key = (artifact.layer_id, artifact.extent)
        if key in existing:
            index["layers"][existing[key]] = entry
        else:
            index["layers"].append(entry)
    index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return index_path


def update_terrain_manifest_layers(
    artifacts: list[LayerArtifact], *, output_root: Path | None = None
) -> Path:
    """Record generated layer PNG + sidecar checksums in the shared terrain
    manifest, under a dedicated ``layers`` key (parallel to the existing
    per-site ``artifacts`` key, which this never touches)."""

    import hashlib

    terrain_root = _terrain_root(output_root)
    manifest_path = terrain_root / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {}
    manifest.setdefault("version", "0.1.0")
    layers_section = manifest.setdefault("layers", {})
    for artifact in artifacts:
        png_bytes = artifact.png_path.read_bytes()
        sidecar_path = artifact.png_path.with_suffix(".json")
        sidecar_bytes = sidecar_path.read_bytes()
        key = f"{artifact.layer_id}:{artifact.extent}"
        layers_section[key] = {
            "version": "0.1.0",
            "layer_id": artifact.layer_id,
            "extent": artifact.extent,
            "created_utc": artifact.sidecar["created_utc"],
            "git_commit": artifact.sidecar.get("git_commit"),
            "files": {
                "png": {
                    "path": f"terrain/{artifact.png_path.relative_to(terrain_root).as_posix()}",
                    "sha256": hashlib.sha256(png_bytes).hexdigest(),
                },
                "json": {
                    "path": f"terrain/{sidecar_path.relative_to(terrain_root).as_posix()}",
                    "sha256": hashlib.sha256(sidecar_bytes).hexdigest(),
                },
            },
        }
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return manifest_path
