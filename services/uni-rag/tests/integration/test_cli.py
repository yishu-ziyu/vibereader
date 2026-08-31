"""Integration test: Typer CLI."""
import pytest
from pathlib import Path
from typer.testing import CliRunner
from cli.main import app


@pytest.fixture
def runner(tmp_path, monkeypatch):
    monkeypatch.setenv("UNI_RAG_DATA_DIR_PATH", str(tmp_path))
    monkeypatch.setenv("UNI_RAG_LLM_API_KEY", "test-key")
    import uni_rag.config as config
    config._settings = None
    return CliRunner()


def test_ingest_command(runner):
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"
    result = runner.invoke(app, ["ingest", str(pdf)])
    assert result.exit_code == 0
    assert "chunks" in result.stdout


def test_kb_create_list_delete_commands(runner):
    """CLI 能创建、列出、删除知识库，服务本地多课程资料管理。"""
    created = runner.invoke(app, ["kb", "create", "CS101", "--description", "课程笔记"])
    assert created.exit_code == 0, created.stdout
    assert "cs101" in created.stdout

    listed = runner.invoke(app, ["kb", "list"])
    assert listed.exit_code == 0, listed.stdout
    assert "CS101" in listed.stdout
    assert "课程笔记" in listed.stdout

    deleted = runner.invoke(app, ["kb", "delete", "cs101"])
    assert deleted.exit_code == 0, deleted.stdout
    assert "已删除" in deleted.stdout

    listed = runner.invoke(app, ["kb", "list"])
    assert listed.exit_code == 0, listed.stdout
    assert "cs101" not in listed.stdout


def test_kb_ingest_command_uses_scoped_uploads(runner):
    """CLI 入库到指定 KB 时，文件落入该 KB 的独立 uploads 目录。"""
    runner.invoke(app, ["kb", "create", "CS101"])
    pdf = Path(__file__).resolve().parents[1] / "fixtures" / "sample.pdf"

    result = runner.invoke(app, ["kb", "ingest", "cs101", str(pdf)])
    assert result.exit_code == 0, result.stdout
    assert "cs101" in result.stdout
    assert "chunks" in result.stdout

    from uni_rag.config import load_settings
    assert (load_settings().data_dir / "kbs" / "cs101" / "uploads" / "sample.pdf").exists()


