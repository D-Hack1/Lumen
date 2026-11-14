"""G1: independent SpiceyPy/Skyfield validation of the DE421 lunar frame."""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from lumen_pipeline.common.constants import LUNAR_RADIUS_KM
from lumen_pipeline.common.frames import site_up_vector
from lumen_pipeline.common.timeutil import utc_to_et
from lumen_pipeline.ephem.kernels import MOON_FRAME, SKYFIELD_MOON_FRAME, loaded_kernels

MATRIX_TOLERANCE = 1e-9
DIRECTION_TOLERANCE_RAD = 1e-6
DEFAULT_EPOCHS = ("2023-01-01T00:00:00Z", "2025-03-06T17:28:50Z", "2030-12-31T23:00:00Z")
DEFAULT_SITES = ((-84.7906, 29.1957), (-69.373, 32.319), (-90.0, 0.0))


@dataclass(frozen=True)
class G1Result:
    passed: bool
    max_matrix_error: float
    max_direction_error_rad: float
    max_site_transform_error_m: float
    pa_me_surface_offset_m: float
    epochs: tuple[str, ...]


def _angle(left: np.ndarray, right: np.ndarray) -> float:
    cosine = float(np.clip(np.dot(left, right) / np.linalg.norm(left) / np.linalg.norm(right), -1.0, 1.0))
    return math.acos(cosine)


def _skyfield_rotation_and_directions(epoch: str, kernel_dir: Path) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    from skyfield.api import load, load_file
    from skyfield.planetarylib import PlanetaryConstants

    constants = PlanetaryConstants()
    with (kernel_dir / "pck00011.tpc").open("rb") as kernel:
        constants.read_text(kernel)
    with (kernel_dir / "moon_080317.tf").open("rb") as kernel:
        constants.read_text(kernel)
    # PlanetaryConstants defers binary-PCK reads until rotation_at(), so this
    # handle must remain open until the rotation has been evaluated.
    with (kernel_dir / "moon_pa_de421_1900-2050.bpc").open("rb") as kernel:
        constants.read_binary(kernel)
        frame = constants.build_frame_named(SKYFIELD_MOON_FRAME)
        timescale = load.timescale()
        # Skyfield's frame PCK is evaluated in TDB. Anchor it to SPICE ET
        # rather than separately converting UTC in each library.
        instant = timescale.tdb_jd(2451545.0 + utc_to_et(epoch) / 86400.0)
        ephemeris = load_file(kernel_dir / "de421.bsp")
        moon_position = ephemeris["moon"].at(instant).position.km
        directions = {
            body: ephemeris[body.lower()].at(instant).position.km - moon_position
            for body in ("SUN", "EARTH")
        }
        return np.asarray(frame.rotation_at(instant), dtype=float), directions


def run_g1(kernel_dir: str | Path | None = None, epochs: Sequence[str] = DEFAULT_EPOCHS) -> G1Result:
    """Run G1 with actual kernels; no result is produced if kernels are absent."""
    import spiceypy as spice

    max_matrix_error = 0.0
    max_direction_error = 0.0
    max_site_error_m = 0.0
    max_pa_me_offset_m = 0.0
    with loaded_kernels(kernel_dir) as paths:
        directory = paths[0].parent
        for epoch in epochs:
            et = utc_to_et(epoch)
            spice_rotation = np.asarray(spice.pxform("J2000", MOON_FRAME, et), dtype=float)
            skyfield_rotation, skyfield_j2000_directions = _skyfield_rotation_and_directions(epoch, directory)
            max_matrix_error = max(max_matrix_error, float(np.max(np.abs(spice_rotation - skyfield_rotation))))
            if not np.allclose(spice_rotation @ spice_rotation.T, np.eye(3), atol=MATRIX_TOLERANCE):
                raise RuntimeError("SPICE MOON_ME rotation is not orthogonal")
            if np.linalg.det(spice_rotation) <= 0.0:
                raise RuntimeError("SPICE MOON_ME rotation is not right-handed")
            for body in ("SUN", "EARTH"):
                spice_direction = np.asarray(spice.spkpos(body, et, MOON_FRAME, "NONE", "MOON")[0], dtype=float)
                skyfield_direction = skyfield_rotation @ skyfield_j2000_directions[body]
                max_direction_error = max(max_direction_error, _angle(spice_direction, skyfield_direction))
            for latitude, longitude in DEFAULT_SITES:
                site_me = LUNAR_RADIUS_KM * site_up_vector(latitude, longitude)
                site_j2000 = spice_rotation.T @ site_me
                site_round_trip = skyfield_rotation @ site_j2000
                max_site_error_m = max(max_site_error_m, float(np.linalg.norm(site_me - site_round_trip) * 1000.0))
            pa_to_me = np.asarray(spice.pxform("MOON_PA_DE421", MOON_FRAME, et), dtype=float)
            max_pa_me_offset_m = max(
                max_pa_me_offset_m,
                float(np.linalg.norm((pa_to_me - np.eye(3)) @ np.array([LUNAR_RADIUS_KM, 0.0, 0.0])) * 1000.0),
            )
    passed = max_matrix_error < MATRIX_TOLERANCE and max_direction_error < DIRECTION_TOLERANCE_RAD
    return G1Result(passed, max_matrix_error, max_direction_error, max_site_error_m, max_pa_me_offset_m, tuple(epochs))


if __name__ == "__main__":
    print(json.dumps(asdict(run_g1()), indent=2))
