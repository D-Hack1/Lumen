from pathlib import Path

import pytest

from lumen_pipeline.ephem import kernels
from lumen_pipeline.ephem.kernels import MissingKernelError, kernel_paths
from lumen_pipeline.validation.frame_check import run_g1


def test_missing_kernel_error_lists_every_required_file(tmp_path):
    with pytest.raises(MissingKernelError) as error:
        kernel_paths(tmp_path)
    for filename in kernels.KERNEL_FILENAMES:
        assert filename in str(error.value)


def test_resolve_moon_frame_requires_the_de421_frame():
    class MatchingSpice:
        def namfrm(self, name):
            return 31006

    assert kernels.resolve_moon_frame(MatchingSpice()) == "MOON_ME_DE421"


def test_resolve_moon_frame_rejects_missing_frame():
    class MissingSpice:
        def namfrm(self, name):
            return 0

    with pytest.raises(RuntimeError, match="MOON_ME_DE421"):
        kernels.resolve_moon_frame(MissingSpice())


def test_loaded_kernels_always_clears_the_kernel_pool(monkeypatch):
    calls = []

    monkeypatch.setattr(kernels, "load_kernels", lambda directory: calls.append(("load", directory)) or ())
    monkeypatch.setattr(kernels, "clear_kernels", lambda: calls.append(("clear", None)))

    with kernels.loaded_kernels("test-kernels"):
        pass

    assert calls == [("load", "test-kernels"), ("clear", None)]


def test_g1_requires_actual_kernel_files(tmp_path):
    with pytest.raises(MissingKernelError):
        run_g1(Path(tmp_path))
