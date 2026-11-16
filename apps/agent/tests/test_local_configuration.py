"""Host tools use root configuration and keep their generated output outside the checkout."""
from pathlib import Path

import pytest

from life_agent import config


def test_default_env_reads_root_and_only_returns_agent_settings(tmp_path, monkeypatch):
    agent = tmp_path / "apps" / "agent"
    agent.mkdir(parents=True)
    (tmp_path / ".env").write_text("GEMINI_API_KEY=synthetic-root-key\nDB_BOOTSTRAP_PASSWORD=synthetic-owner\n", encoding="utf-8")
    (agent / ".env").write_text("GEMINI_API_KEY=synthetic-obsolete-key\n", encoding="utf-8")
    monkeypatch.setattr(config, "AGENT_ROOT", agent)
    monkeypatch.setattr(config, "REPO_ROOT", tmp_path, raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    values = config.load_env()
    assert values["GEMINI_API_KEY"] == "synthetic-root-key"
    assert "DB_BOOTSTRAP_PASSWORD" not in values


def test_report_output_uses_user_data_and_rejects_repo_paths(tmp_path, monkeypatch):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evaluation"))
    import evaluate as ev

    monkeypatch.setattr(ev, "REPO_ROOT", tmp_path / "checkout")
    monkeypatch.setattr(config, "user_data_directory", lambda: tmp_path / "host-data", raising=False)
    output = ev.report_output_path(None, "retrieval", "synthetic-stamp")
    assert output == tmp_path / "host-data" / "agent-eval" / "retrieval-synthetic-stamp.json"
    for target in (ev.REPO_ROOT / ".local" / "report.json", ev.REPO_ROOT / "report.json"):
        with pytest.raises(config.ConfigError):
            ev.report_output_path(target, "retrieval", "synthetic-stamp")
