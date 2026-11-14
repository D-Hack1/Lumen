import json

import numpy as np

from lumen_pipeline.catalog.build_catalog import EXPECTED_SITE_IDS, build_catalog
from lumen_pipeline.common.frames import site_rotation_matrix


def test_g6_catalog_schema_coordinates_and_pending_terrain(tmp_path):
    output = tmp_path / "sites.json"
    catalog = build_catalog(output_path=output)

    assert catalog["schema"] == "catalog"
    assert catalog["version"] == 1
    assert catalog["coordinate_frame"] == "MOON_ME_DE421"
    assert tuple(site["id"] for site in catalog["sites"]) == EXPECTED_SITE_IDS
    assert json.loads(output.read_text(encoding="utf-8")) == catalog
    for site in catalog["sites"]:
        assert site["coordinate_frame"] == "MOON_ME_DE421"
        assert site["tier"] == "pending"
        assert site["terrain"]["status"] == "pending"
        assert all(value is None for key, value in site["terrain"].items() if key != "status")
        assert site["verification_status"] == "verified"

    cy3 = catalog["sites"][1]
    assert cy3["landing_coords"]["lat"] == -69.373
    assert cy3["target_coords"]["lon"] == 32.348126
    assert cy3["touchdown_utc"] == "2023-08-23T12:33:00Z"
    assert cy3["touchdown_precision"] == "minute"

    blue_ghost = catalog["sites"][3]
    assert blue_ghost["landing_coords"] is None
    assert blue_ghost["target_coords"]["lat"] == 18.56
    assert blue_ghost["last_contact_utc"] == "2025-03-16T23:25:00Z"


def test_g6_rotation_matrices_are_frame_consistent_and_right_handed(tmp_path):
    catalog = build_catalog(output_path=tmp_path / "sites.json")

    for site in catalog["sites"]:
        matrix = np.asarray(site["rotation_matrix"])
        expected = site_rotation_matrix(site["latitude_deg"], site["longitude_deg_east"])
        np.testing.assert_allclose(matrix, expected, atol=1e-15)
        np.testing.assert_allclose(matrix @ matrix.T, np.eye(3), atol=1e-12)
        assert np.linalg.det(matrix) > 0.0
    assert [site["reference_axis"] for site in catalog["sites"]] == [
        "+X_ME",
        "+X_ME",
        "+X_ME",
        "+Z_ME",
    ]


def test_g6_catalog_is_deterministic(tmp_path):
    output = tmp_path / "sites.json"
    build_catalog(output_path=output)
    first = output.read_bytes()
    build_catalog(output_path=output)
    assert output.read_bytes() == first
