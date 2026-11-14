import numpy as np
import pytest

from lumen_pipeline.reference.bounds import (
    PAIR_WINDOW_SECONDS,
    WindowSpec,
    evaluate_with_bounds,
    pair_nearest_event,
)
from lumen_pipeline.reference.events import Event
from lumen_pipeline.reference.visibility import Horizon


def _pair_nearest(event: Event, candidates: tuple[Event, ...]) -> Event | None:
    matches = [candidate for candidate in candidates if candidate.type == event.type]
    return min(matches, key=lambda candidate: abs(candidate.et - event.et), default=None)


def _triangle_spec(type: str = "sun") -> WindowSpec:
    return WindowSpec(
        type,
        f"{type}_down",
        f"{type}_up",
        lambda et, horizon: 1.0 - abs(et - 360.0) / 120.0 >= horizon.effective_at(0.0),
        lambda _start, _end, _horizon: 1.0,
    )


def test_pair_nearest_event_matches_type_ties_boundary_and_vanished():
    nominal = Event("sunset", 100.0)
    first_tie = Event("sunset", 90.0)
    assert pair_nearest_event(nominal, (Event("shadowExit", 100.0), Event("sunset", 130.0), first_tie, Event("sunset", 110.0))) is first_tie
    assert pair_nearest_event(nominal, (Event("sunset", 100.0 + PAIR_WINDOW_SECONDS),)).et == 100.0 + PAIR_WINDOW_SECONDS
    assert pair_nearest_event(nominal, (Event("sunset", 100.0 + PAIR_WINDOW_SECONDS + 0.1),)) is None


def test_three_pass_bounds_use_independent_refined_windows_and_metrics():
    result = evaluate_with_bounds(
        0.0,
        720.0,
        Horizon(np.zeros(3600)),
        0.5,
        [_triangle_spec(), _triangle_spec("earth"), _triangle_spec("link"), _triangle_spec("ops")],
        pair_event=_pair_nearest,
    )

    assert result.metrics["sunlitPct"].value == pytest.approx(100.0 / 3.0, abs=3.0)
    assert result.metrics["sunlitPct"].lo < result.metrics["sunlitPct"].value < result.metrics["sunlitPct"].hi
    assert result.metrics["linkPct"].lo < result.metrics["linkPct"].value < result.metrics["linkPct"].hi
    assert result.metrics["longestNightH"].lo < result.metrics["longestNightH"].value < result.metrics["longestNightH"].hi
    assert result.metrics["opsHours"].lo < result.metrics["opsHours"].value < result.metrics["opsHours"].hi
    assert result.sunlit_duration_hours.value == pytest.approx(1.0 / 15.0, abs=0.01)

    window = result.windows["sun"][0]
    assert window.start_et.lo < window.start_et.value < window.start_et.hi
    assert window.end_et.lo < window.end_et.value < window.end_et.hi
    assert window.duration_hours.lo < window.duration_hours.value < window.duration_hours.hi
    assert {event.dt_method for event in result.events["sun"]} == {"exact"}
    assert all(event.dt_seconds == pytest.approx(60.0, abs=5.0) for event in result.events["sun"])


def test_zero_sigma_collapses_bounds_and_partial_endpoints_are_fixed():
    result = evaluate_with_bounds(
        0.0,
        720.0,
        Horizon(np.zeros(3600)),
        0.0,
        [
            WindowSpec(
                "sun",
                "sun_down",
                "sun_up",
                lambda _et, horizon: 1.0 >= horizon.effective_at(0.0),
                lambda _start, _end, _horizon: 1.0,
            )
        ],
        pair_event=_pair_nearest,
    )

    for value in [result.metrics["sunlitPct"], result.metrics["longestNightH"], result.sunlit_duration_hours]:
        assert value.lo == value.value == value.hi
    window = result.windows["sun"][0]
    assert window.nominal.partial_start and window.nominal.partial_end
    assert window.start_et.lo == window.start_et.value == window.start_et.hi == 0.0
    assert window.end_et.lo == window.end_et.value == window.end_et.hi == 720.0


def test_vanished_shifted_event_keeps_nominal_window_but_omits_its_range():
    result = evaluate_with_bounds(
        0.0,
        720.0,
        Horizon(np.zeros(3600)),
        0.5,
        [
            WindowSpec(
                "sun",
                "sun_down",
                "sun_up",
                lambda et, horizon: 0.25 - abs(et - 360.0) / 120.0 >= horizon.effective_at(0.0),
                lambda _start, _end, _horizon: 0.25,
            )
        ],
        pair_event=_pair_nearest,
    )

    assert result.events["sun"]
    assert {event.grazing_reason for event in result.events["sun"]} == {"vanishes"}
    window = result.windows["sun"][0]
    assert window.start_et.lo is None and window.end_et.hi is None
    assert window.duration_hours.lo is None and window.duration_hours.hi is None
