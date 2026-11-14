import math

from lumen_pipeline.ephem.kernels import loaded_kernels
from lumen_pipeline.validation.horizons_client import (
    AZIMUTH_TOLERANCE_DEG,
    ELEVATION_TOLERANCE_DEG,
    EPOCHS_PER_SITE,
    RANGE_TOLERANCE_KM,
    SITE_CASES,
    SiteCase,
    _spice_observation,
    fixture_path,
    load_fixture,
    run_g3,
)


def test_horizons_fixtures_are_traceable_and_complete():
    for site in SITE_CASES:
        for body in ("sun", "earth"):
            fixture_site, fixture_body, records = load_fixture(fixture_path(site, body))
            assert fixture_site == site
            assert fixture_body == body
            assert len(records) == EPOCHS_PER_SITE


def test_g3_de421_smooth_sphere_agrees_with_horizons():
    comparisons = run_g3()

    assert len(comparisons) == len(SITE_CASES) * EPOCHS_PER_SITE * 2
    assert max(result.elevation_error_deg for result in comparisons) < ELEVATION_TOLERANCE_DEG
    earth_range_errors = [result.range_error_km for result in comparisons if result.body == "earth"]
    assert max(earth_range_errors) < RANGE_TOLERANCE_KM
    azimuth_errors = [result.azimuth_error_deg for result in comparisons if result.azimuth_error_deg is not None]
    assert max(azimuth_errors) < AZIMUTH_TOLERANCE_DEG


def test_g3_equator_longitude_sign_sanity_check():
    _, _, records = load_fixture(fixture_path(SITE_CASES[-1], "earth"))

    assert all(record.elevation_deg > 75.0 for record in records)
    assert all(not math.isnan(record.azimuth_deg) for record in records)


def test_g3_exact_pole_skips_undefined_true_azimuth():
    with loaded_kernels():
        azimuth, elevation, distance = _spice_observation(
            SiteCase("south_pole", -90.0, 0.0), "earth", "2025-03-06T00:00:00Z"
        )

    assert math.isnan(azimuth)
    assert -90.0 <= elevation <= 90.0
    assert distance > 0.0
