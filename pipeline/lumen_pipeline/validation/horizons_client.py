"""JPL Horizons fixture cache and offline G3 smooth-sphere validation."""

from __future__ import annotations

import csv
import io
import json
import math
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import requests

from lumen_pipeline.common.constants import AU_KM
from lumen_pipeline.common.frames import site_position_km, site_up_vector, true_north_vector
from lumen_pipeline.common.timeutil import utc_to_et
from lumen_pipeline.ephem.ephemeris import ABERRATION_CORRECTION
from lumen_pipeline.ephem.kernels import MOON_FRAME, loaded_kernels

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
START_TIME = "2023-01-01"
STOP_TIME = "2030-12-31"
STEP_SIZE = "150d"
EPOCHS_PER_SITE = 20
ELEVATION_TOLERANCE_DEG = 0.01
AZIMUTH_TOLERANCE_DEG = 0.01
RANGE_TOLERANCE_KM = 1.0


@dataclass(frozen=True)
class SiteCase:
    id: str
    latitude_deg: float
    longitude_deg_east: float


SITE_CASES = (
    SiteCase("im2_athena", -84.7906, 29.1957),
    SiteCase("cy3_shiv_shakti", -69.373, 32.319),
    SiteCase("shackleton_ridge", -89.54, 129.0),
    SiteCase("blue_ghost_m1", 18.56, 61.81),
    SiteCase("equator_zero", 0.0, 0.0),
)


@dataclass(frozen=True)
class HorizonsRecord:
    utc: str
    azimuth_deg: float
    elevation_deg: float
    range_km: float


@dataclass(frozen=True)
class Comparison:
    site_id: str
    body: str
    utc: str
    elevation_error_deg: float
    azimuth_error_deg: float | None
    range_error_km: float


def default_fixture_dir() -> Path:
    """Return the checked-in, offline G3 fixture directory."""
    return Path(__file__).resolve().parents[2] / "tests" / "gowri" / "fixtures" / "horizons"


def horizons_parameters(site: SiteCase, body: str) -> dict[str, str]:
    """Build the R3-locked Horizons observer request for one body and site."""
    command = {"sun": "10", "earth": "399"}[body]
    return {
        "format": "text",
        "COMMAND": f"'{command}'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "SITE_COORD": f"'{site.longitude_deg_east},{site.latitude_deg},0'",
        "START_TIME": f"'{START_TIME}'",
        "STOP_TIME": f"'{STOP_TIME}'",
        "STEP_SIZE": f"'{STEP_SIZE}'",
        "QUANTITIES": "'4,20'",
        "CSV_FORMAT": "'YES'",
        "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'",
        "EXTRA_PREC": "'YES'",
    }


def parse_horizons_response(response: str) -> tuple[HorizonsRecord, ...]:
    """Extract airless apparent azimuth, elevation, and apparent range from CSV output."""
    try:
        table = response.split("$$SOE", maxsplit=1)[1].split("$$EOE", maxsplit=1)[0]
    except IndexError as error:
        raise ValueError("Horizons response did not contain an ephemeris table") from error
    records: list[HorizonsRecord] = []
    for row in csv.reader(io.StringIO(table.strip())):
        if len(row) < 6:
            continue
        records.append(
            HorizonsRecord(
                utc=datetime.strptime(row[0].strip(), "%Y-%b-%d %H:%M")
                .replace(tzinfo=UTC)
                .isoformat()
                .replace("+00:00", "Z"),
                azimuth_deg=float(row[3]),
                elevation_deg=float(row[4]),
                range_km=float(row[5]) * AU_KM,
            )
        )
    if not records:
        raise ValueError("Horizons response contained no records")
    return tuple(records)


def fixture_path(site: SiteCase, body: str, directory: str | Path | None = None) -> Path:
    """Return the traceable cache path for one Horizons request."""
    base = Path(directory) if directory is not None else default_fixture_dir()
    return base / f"{site.id}_{body}.json"


def cache_fixture(site: SiteCase, body: str, directory: str | Path | None = None) -> Path:
    """Fetch and store a real Horizons response with its exact query provenance."""
    parameters = horizons_parameters(site, body)
    response = requests.get(HORIZONS_API_URL, params=parameters, timeout=60)
    response.raise_for_status()
    records = parse_horizons_response(response.text)
    if len(records) != EPOCHS_PER_SITE:
        raise ValueError(f"expected {EPOCHS_PER_SITE} Horizons epochs, received {len(records)}")
    path = fixture_path(site, body, directory)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "NASA/JPL Horizons API",
        "fetched_utc": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "site": asdict(site),
        "body": body,
        "request_url": response.url,
        "request_parameters": parameters,
        "response": response.text,
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def cache_all_fixtures(directory: str | Path | None = None) -> tuple[Path, ...]:
    """Fetch all 5 x 20 x 2 real Horizons fixture sets; never used by tests."""
    return tuple(cache_fixture(site, body, directory) for site in SITE_CASES for body in ("sun", "earth"))


def load_fixture(path: str | Path) -> tuple[SiteCase, str, tuple[HorizonsRecord, ...]]:
    """Load and validate a cached response without making a network request."""
    payload: dict[str, Any] = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("source") != "NASA/JPL Horizons API" or not payload.get("request_url"):
        raise ValueError(f"fixture lacks Horizons provenance: {path}")
    site = SiteCase(**payload["site"])
    body = payload["body"]
    if payload.get("request_parameters") != horizons_parameters(site, body):
        raise ValueError(f"fixture request does not match the R3 G3 query: {path}")
    if "Atmos refraction: NO (AIRLESS)" not in payload["response"]:
        raise ValueError(f"fixture is not airless apparent Horizons output: {path}")
    records = parse_horizons_response(payload["response"])
    if len(records) != EPOCHS_PER_SITE:
        raise ValueError(f"fixture has {len(records)} epochs instead of {EPOCHS_PER_SITE}: {path}")
    return site, body, records


def _angular_difference_deg(left: float, right: float) -> float:
    return abs((left - right + 180.0) % 360.0 - 180.0)


def _spice_observation(site: SiteCase, body: str, utc: str) -> tuple[float, float, float]:
    import spiceypy as spice

    target = {"sun": "SUN", "earth": "EARTH"}[body]
    state, _ = spice.spkezr(target, utc_to_et(utc), MOON_FRAME, ABERRATION_CORRECTION, "MOON")
    vector = np.asarray(state[:3]) - site_position_km(site.latitude_deg, site.longitude_deg_east)
    direction = vector / np.linalg.norm(vector)
    up = site_up_vector(site.latitude_deg, site.longitude_deg_east)
    elevation = math.degrees(math.asin(float(np.clip(direction @ up, -1.0, 1.0))))
    if abs(abs(site.latitude_deg) - 90.0) < 1e-12:
        azimuth = math.nan
    else:
        longitude = math.radians(site.longitude_deg_east)
        east = np.array([-math.sin(longitude), math.cos(longitude), 0.0])
        north = true_north_vector(site.latitude_deg, site.longitude_deg_east)
        azimuth = math.degrees(math.atan2(float(direction @ east), float(direction @ north))) % 360.0
    return azimuth, elevation, float(np.linalg.norm(vector))


def run_g3(fixtures_dir: str | Path | None = None) -> tuple[Comparison, ...]:
    """Compare cached Horizons data with DE421 LT+S smooth-sphere geometry offline."""
    directory = Path(fixtures_dir) if fixtures_dir is not None else default_fixture_dir()
    comparisons: list[Comparison] = []
    with loaded_kernels():
        for site in SITE_CASES:
            for body in ("sun", "earth"):
                fixture_site, fixture_body, records = load_fixture(fixture_path(site, body, directory))
                if fixture_site != site or fixture_body != body:
                    raise ValueError(f"fixture identity mismatch for {site.id} {body}")
                for record in records:
                    azimuth, elevation, distance = _spice_observation(site, body, record.utc)
                    comparisons.append(
                        Comparison(
                            site.id,
                            body,
                            record.utc,
                            abs(elevation - record.elevation_deg),
                            None if math.isnan(azimuth) else _angular_difference_deg(azimuth, record.azimuth_deg),
                            abs(distance - record.range_km),
                        )
                    )
    return tuple(comparisons)
