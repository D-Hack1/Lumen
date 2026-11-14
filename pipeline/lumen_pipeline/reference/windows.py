"""Run-length encoding for visibility windows with explicit endpoint semantics."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class Window:
    type: str
    start_et: float
    end_et: float
    peak_elevation_deg: float
    partial_start: bool
    partial_end: bool

    @property
    def duration_hours(self) -> float:
        return (self.end_et - self.start_et) / 3600.0


def merge_windows(
    type: str, times: Sequence[float], visible: Sequence[bool], elevations_deg: Sequence[float]
) -> list[Window]:
    """Merge true sample intervals; a true run uses [first sample, first false sample)."""
    if len(times) != len(visible) or len(times) != len(elevations_deg) or len(times) < 2:
        raise ValueError("times, visibility, and elevations must have matching length >= 2")
    windows: list[Window] = []
    start: int | None = None
    for index, value in enumerate(visible):
        if value and start is None:
            start = index
        if start is not None and (not value or index == len(visible) - 1):
            stop = index
            if stop > start:
                windows.append(
                    Window(
                        type,
                        times[start],
                        times[stop],
                        max(elevations_deg[start : stop + 1]),
                        start == 0,
                        stop == len(visible) - 1,
                    )
                )
            start = None
    return windows
