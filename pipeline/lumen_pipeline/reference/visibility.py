"""R3 horizon interpolation, near-zone occlusion, and disk visibility."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from lumen_pipeline.common.constants import (
    EARTH_RADIUS_KM,
    LUNAR_RADIUS_KM,
    SUN_ANGULAR_RADIUS_DEG_AT_1_AU,
)


@dataclass(frozen=True)
class Horizon:
    elevations_deg: np.ndarray | None = None
    bin_width_deg: float = 0.1
    slope_deg: float | None = None
    uphill_azimuth_deg: float | None = None
    d_min_m: float | None = None
    observer_height_m: float = 0.0

    def elevation_at(self, azimuth_deg: float) -> float:
        if self.elevations_deg is None:
            return -math.degrees(math.acos(LUNAR_RADIUS_KM / (LUNAR_RADIUS_KM + self.observer_height_m / 1000.0)))
        values = self.elevations_deg
        count = len(values)
        coordinate = (azimuth_deg % 360.0) / self.bin_width_deg - 0.5
        left = math.floor(coordinate) % count
        fraction = coordinate - math.floor(coordinate)
        right = (left + 1) % count
        return float((1.0 - fraction) * values[left] + fraction * values[right])

    def effective_at(self, azimuth_deg: float) -> float:
        terrain = self.elevation_at(azimuth_deg)
        if self.slope_deg is None or self.uphill_azimuth_deg is None or self.d_min_m is None:
            return terrain
        slope = math.radians(self.slope_deg)
        near = math.degrees(
            math.atan(
                math.tan(slope) * math.cos(math.radians(azimuth_deg - self.uphill_azimuth_deg))
                - self.observer_height_m / self.d_min_m
            )
        )
        near_positive = max(0.0, near)
        return terrain if near_positive == 0.0 else max(terrain, near_positive)

    def extrema(self, centre_azimuth_deg: float, half_width_deg: float) -> tuple[float, float]:
        if self.elevations_deg is None:
            value = self.effective_at(centre_azimuth_deg)
            return value, value
        sample_count = max(2, math.ceil(2.0 * half_width_deg / self.bin_width_deg) + 2)
        azimuths = np.linspace(centre_azimuth_deg - half_width_deg, centre_azimuth_deg + half_width_deg, sample_count)
        values = [self.effective_at(float(azimuth)) for azimuth in azimuths]
        return min(values), max(values)


def angular_radius_deg(body: str, distance_km: float) -> float:
    if body == "sun":
        return SUN_ANGULAR_RADIUS_DEG_AT_1_AU * 149_597_870.7 / distance_km
    if body == "earth":
        return math.degrees(math.asin(EARTH_RADIUS_KM / distance_km))
    raise ValueError(f"unsupported body: {body}")


def disk_fraction(body: str, elevation_deg: float, azimuth_deg: float, distance_km: float, horizon: Horizon) -> float:
    """Return visible disk fraction using R3 span checks and 24/32 chord quadrature."""
    radius = angular_radius_deg(body, distance_km)
    cosine = max(math.cos(math.radians(min(abs(elevation_deg), 89.9))), math.cos(math.radians(89.9)))
    half_width = 180.0 if radius >= 90.0 - elevation_deg else math.degrees(math.asin(math.sin(math.radians(radius)) / cosine))
    minimum, maximum = horizon.extrema(azimuth_deg, half_width)
    if elevation_deg - 1.05 * radius > maximum:
        return 1.0
    if elevation_deg + 1.05 * radius < minimum:
        return 0.0
    chords = 24 if body == "sun" else 32
    radius_rad = math.radians(radius)
    visible_area = 0.0
    for index in range(chords):
        x = radius_rad * (2.0 * (index + 0.5) / chords - 1.0)
        half_chord = math.sqrt(max(0.0, radius_rad * radius_rad - x * x))
        azimuth_offset = math.degrees(math.asin(math.sin(x) / cosine))
        mask = horizon.effective_at(azimuth_deg + azimuth_offset)
        visible_lower = max(-half_chord, math.radians(mask - elevation_deg))
        visible_area += max(0.0, half_chord - visible_lower)
    return float(np.clip(visible_area * (2.0 * radius_rad / chords) / (math.pi * radius_rad**2), 0.0, 1.0))


def availability(
    body: str, elevation_deg: float, azimuth_deg: float, distance_km: float, horizon: Horizon,
    *, disk_threshold: float, margin_deg: float = 0.0, min_sun_elevation_ops_deg: float = 0.0,
) -> tuple[float, float, bool]:
    fraction = disk_fraction(body, elevation_deg, azimuth_deg, distance_km, horizon)
    clearance = elevation_deg - horizon.effective_at(azimuth_deg)
    visible = fraction >= disk_threshold and clearance >= margin_deg
    if body == "sun":
        visible = visible and elevation_deg >= min_sun_elevation_ops_deg
    return fraction, clearance, visible
