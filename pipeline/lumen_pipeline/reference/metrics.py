"""First-pass geometry-only metrics; unavailable downstream products stay null."""

from __future__ import annotations

from collections.abc import Sequence


def bounded(value: float | None) -> dict[str, float | None]:
    """Use null bounds until the R3 three-mask uncertainty passes are available."""
    return {"value": value, "lo": None, "hi": None}


def _longest_false_run_hours(times: Sequence[float], values: Sequence[bool]) -> float:
    longest = 0.0
    start: float | None = None
    for index, value in enumerate(values):
        if not value and start is None:
            start = times[index]
        if start is not None and (value or index == len(values) - 1):
            end = times[index]
            longest = max(longest, (end - start) / 3600.0)
            start = None
    return longest


def first_pass_metrics(
    times: Sequence[float], sun_visible: Sequence[bool], earth_visible: Sequence[bool], sun_elevation_deg: Sequence[float],
    earth_elevation_deg: Sequence[float], sun_clearance_deg: Sequence[float], earth_clearance_deg: Sequence[float], sun_disk_fraction: Sequence[float],
) -> dict[str, object]:
    """Return metrics that need only geometry, explicitly omitting DSN/power/terrain products."""
    duration = times[-1] - times[0]
    if duration <= 0:
        raise ValueError("metric range must have positive duration")
    sun_seconds = sum((times[index + 1] - times[index]) for index in range(len(times) - 1) if sun_visible[index])
    earth_seconds = sum((times[index + 1] - times[index]) for index in range(len(times) - 1) if earth_visible[index])
    return {
        "sunElevationDeg": bounded(sun_elevation_deg[0]),
        "sunClearanceDeg": bounded(sun_clearance_deg[0]),
        "sunDiskPct": bounded(100.0 * sun_disk_fraction[0]),
        "earthElevationDeg": bounded(earth_elevation_deg[0]),
        "dteMarginDeg": bounded(earth_clearance_deg[0]),
        "sunlitPct": bounded(100.0 * sun_seconds / duration),
        "earthVisiblePct": bounded(100.0 * earth_seconds / duration),
        "linkPct": bounded(None),
        "longestNightH": bounded(_longest_false_run_hours(times, sun_visible)),
        "longestCommGapH": bounded(None),
        "opsHours": bounded(None),
        "energyPerDayWh": bounded(None),
        "sunElevationAtTouchdownDeg": bounded(sun_elevation_deg[0]),
        "padSlopeDeg": None,
        "psrDistanceKm": None,
    }
