"""Validation against the shared agent-v1 JSON Schema (contracts/agent-v1.schema.json).

The schema and fixtures are the same files the Core TypeScript tests use; Python never redefines them.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

_REPO_ROOT = Path(__file__).resolve().parents[4]


def contracts_dir() -> Path:
    return Path(os.environ.get("LIFE_AGENT_CONTRACTS_DIR", _REPO_ROOT / "contracts"))


class ContractError(ValueError):
    """A value does not match its agent-v1 contract type. Messages carry paths only, never payload values."""

    def __init__(self, type_name: str, problems: list[str]):
        self.type_name = type_name
        self.problems = problems
        super().__init__(f"{type_name} invalid: " + "; ".join(problems))


@lru_cache(maxsize=1)
def schema() -> dict[str, Any]:
    return json.loads((contracts_dir() / "agent-v1.schema.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def fixtures() -> dict[str, Any]:
    return json.loads((contracts_dir() / "fixtures" / "agent-v1.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def _validator(type_name: str) -> Draft202012Validator:
    root = schema()
    if type_name not in root["$defs"]:
        raise KeyError(f"Unknown contract type {type_name}")
    registry = Registry().with_resource(root["$id"], Resource.from_contents(root))
    return Draft202012Validator({"$ref": f"{root['$id']}#/$defs/{type_name}"}, registry=registry)


def is_valid(type_name: str, value: Any) -> bool:
    return _validator(type_name).is_valid(value)


def validate(type_name: str, value: Any) -> Any:
    errors = sorted(_validator(type_name).iter_errors(value), key=lambda e: list(e.absolute_path))
    if errors:
        problems = ["/" + "/".join(str(p) for p in e.absolute_path) + f" ({e.validator})" for e in errors[:5]]
        raise ContractError(type_name, problems)
    return value
