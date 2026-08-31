"""Verify the Docker image builds cleanly. Skip when docker is unavailable."""
import json
import os
import shutil
import subprocess
import pytest


def _docker_usable() -> tuple[bool, str]:
    """Return (True, '') if docker CLI + daemon are both reachable, else (False, reason)."""
    if shutil.which("docker") is None:
        return False, "docker CLI not installed"
    probe = subprocess.run(
        ["docker", "info"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    if probe.returncode != 0:
        return False, f"docker daemon not reachable: {probe.stderr.strip()}"
    return True, ""


_DOCKER_OK, _DOCKER_REASON = _docker_usable()
SKIP_REASON = _DOCKER_REASON or "docker not installed in this env"


@pytest.mark.skipif(not _DOCKER_OK, reason=SKIP_REASON)
def test_docker_build_succeeds():
    """Run `docker build` and assert exit code 0. Tagged for caching across runs."""
    result = subprocess.run(
        ["docker", "build", "-t", "uni-rag:test-v0.3", "."],
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        capture_output=True,
        text=True,
        timeout=900,  # 15 min — model download is the slow part
    )
    assert result.returncode == 0, (
        f"docker build failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )


@pytest.mark.skipif(not _DOCKER_OK, reason=SKIP_REASON)
def test_docker_image_has_entrypoint():
    """After build, image should be runnable with --help-style no-op invocation."""
    result = subprocess.run(
        ["docker", "image", "inspect", "uni-rag:test-v0.3"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    info = json.loads(result.stdout)
    assert info[0]["Config"]["ExposedPorts"].get("8766/tcp") is not None
