"""Deterministic R3-safe event detection using a two-minute grid and bisection."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

FINE_STEP_SECONDS = 120.0
BISECTION_TOLERANCE_SECONDS = 10.0


@dataclass(frozen=True)
class Event:
    type: str
    et: float
    dt_method: str = "fast"
    grazing_reason: str | None = None
    bracket_start_et: float | None = None
    bracket_end_et: float | None = None
    dt_seconds: float | None = None


def sample_times(start_et: float, end_et: float) -> list[float]:
    """Use the R3 fine cadence; coarse cadence requires unavailable mask extrema proof."""
    if end_et <= start_et:
        raise ValueError("event range must have positive duration")
    count = int((end_et - start_et) // FINE_STEP_SECONDS)
    times = [start_et + index * FINE_STEP_SECONDS for index in range(count + 1)]
    if times[-1] != end_et:
        times.append(end_et)
    return times


def _refine_transition(predicate: Callable[[float], bool], left: float, right: float) -> tuple[float, float, float]:
    left_value = predicate(left)
    if left_value == predicate(right):
        raise ValueError("bisection bracket does not contain a transition")
    while right - left > BISECTION_TOLERANCE_SECONDS:
        middle = (left + right) / 2.0
        if predicate(middle) == left_value:
            left = middle
        else:
            right = middle
    return (left + right) / 2.0, left, right


def detect_events(start_et: float, end_et: float, predicate: Callable[[float], bool], *, down: str, up: str) -> list[Event]:
    """Detect false/true state transitions with half-open window endpoint semantics."""
    times = sample_times(start_et, end_et)
    values = [predicate(time) for time in times]
    events: list[Event] = []
    for left, right, was_visible, is_visible in zip(times[:-1], times[1:], values[:-1], values[1:], strict=True):
        if was_visible != is_visible:
            event_et, bracket_start_et, bracket_end_et = _refine_transition(predicate, left, right)
            events.append(
                Event(
                    up if is_visible else down,
                    event_et,
                    bracket_start_et=bracket_start_et,
                    bracket_end_et=bracket_end_et,
                )
            )
    return events
