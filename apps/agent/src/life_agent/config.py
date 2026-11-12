"""Run limits from Core and deployment configuration.

No value is defaulted in code: a missing limit or config value stops the run instead of inventing a number
(Agent_Design #agent-execution-limits; values for model/graph/token caps are still open at G4).
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, fields
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping


class ConfigError(ValueError):
    pass


def parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ConfigError("timestamp must carry a timezone")
    return parsed


@dataclass(frozen=True)
class RunLimits:
    """Per-run limits sent by Core in ExecutionLimits. Counted per message by the runtime store."""

    deadline_at: datetime
    retrieval_calls_max: int
    core_read_requests_max: int
    core_request_timeout_s: float
    core_retry_per_call: int
    model_calls_max: int
    graph_steps_max: int
    turn_token_budget: int
    finish_reserve_tokens: int

    @classmethod
    def from_contract(cls, limits: Mapping[str, Any]) -> "RunLimits":
        required_open = ["model_calls_max", "graph_steps_max", "turn_token_budget", "finish_reserve_tokens"]
        missing = [name for name in required_open if limits.get(name) is None]
        if missing:
            raise ConfigError("limits not configured: " + ", ".join(missing))
        if limits["finish_reserve_tokens"] >= limits["turn_token_budget"]:
            raise ConfigError("finish_reserve_tokens must be smaller than turn_token_budget")
        return cls(
            deadline_at=parse_timestamp(limits["deadline_at"]),
            retrieval_calls_max=limits["retrieval_calls_max"],
            core_read_requests_max=limits["core_read_requests_max"],
            core_request_timeout_s=limits["core_request_timeout_ms"] / 1000,
            core_retry_per_call=limits["core_retry_per_call"],
            model_calls_max=limits["model_calls_max"],
            graph_steps_max=limits["graph_steps_max"],
            turn_token_budget=limits["turn_token_budget"],
            finish_reserve_tokens=limits["finish_reserve_tokens"],
        )

    def budget_caps(self) -> dict[str, int]:
        return {
            "retrieval_calls": self.retrieval_calls_max,
            "core_read_requests": self.core_read_requests_max,
            "model_calls": self.model_calls_max,
            "model_tokens": self.turn_token_budget,
        }


@dataclass(frozen=True)
class AgentConfig:
    """Deployment configuration. Values are experiment parameters measured in Task 9, not product decisions."""

    graph_version: str
    max_context_chars: int
    recent_turns: int
    history_summary_threshold_chars: int
    copilot_recent_items: int
    max_output_tokens: int
    core_retry_wait_s: float
    chars_per_token: float

    def __post_init__(self) -> None:
        for field in fields(self):
            value = getattr(self, field.name)
            if value is None:
                raise ConfigError(f"{field.name} is required")
            if isinstance(value, (int, float)) and not isinstance(value, bool) and value < 0:
                raise ConfigError(f"{field.name} must not be negative")
        if self.chars_per_token <= 0 or self.max_context_chars <= 0:
            raise ConfigError("chars_per_token and max_context_chars must be positive")


AGENT_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = AGENT_ROOT.parents[1]


def user_data_directory() -> Path:
    """Same host-data convention as scripts/local-state.mjs; runtime credentials remain in Docker volumes."""
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local" / "state")
    return base / "LifeInsuranceAIAssistant"


def load_env(path: Any = None) -> dict[str, str]:
    """Read Agent settings from root .env (or an explicit file); process environment wins.
    Other services' settings are excluded. Values are never printed or rewritten."""
    file = Path(path) if path else REPO_ROOT / ".env"
    values: dict[str, str] = {}
    if file.is_file():
        for line in file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if not key.startswith(("LIFE_AGENT_", "GEMINI_")):
                continue
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            values[key] = value
    elif path:
        raise ConfigError("env file not found")
    values.update({k: v for k, v in os.environ.items() if k.startswith(("LIFE_AGENT_", "GEMINI_"))})
    return values


def require(env: Mapping[str, str], name: str) -> str:
    value = env.get(name)
    if not value:
        raise ConfigError(f"{name} is not set (see root .env.example)")
    return value
