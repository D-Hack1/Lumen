import numpy as np

from lumen_pipeline.common.binio import read_array, write_array


def test_dsn_signed_int16_encoding_round_trip(tmp_path):
    stored = np.array([-180, -1, 0, 1, 180], dtype=np.int16)
    path = tmp_path / "dsn.bin"

    metadata = write_array(
        path,
        stored,
        fields=["moon_elevation"],
        units="degrees",
        producer="test",
        scale=0.5,
    )
    decoded, read_metadata = read_array(path)

    assert metadata["dtype"] == "int16"
    assert read_metadata["scale"] == 0.5
    assert decoded.dtype == np.dtype("<i2")
    np.testing.assert_array_equal(decoded, stored)
    np.testing.assert_allclose(decoded / 2, [-90.0, -0.5, 0.0, 0.5, 90.0])
