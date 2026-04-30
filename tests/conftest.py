# tests/conftest.py
"""Shared pytest fixtures."""
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def tmp_resumes_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provide a temporary saved_sessions/resumes directory.

    Patches the resume_store module's RESUMES_DIR so any code under test
    operating on it uses the tmp dir instead of the real saved_sessions/.
    """
    resumes_dir = tmp_path / "resumes"
    resumes_dir.mkdir(parents=True)
    (resumes_dir / "snapshots").mkdir()
    yield resumes_dir
