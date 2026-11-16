"""Deterministic embedding fakes for corpus/retrieval tests. Not a quality signal: vectors are hashed word counts."""
from __future__ import annotations

import hashlib
import math
import re

from life_agent.model import EmbeddingConfig, ProviderError


def embedding_config(config_id: str = "fake-hash-64.v1", dims: int = 64) -> EmbeddingConfig:
    return EmbeddingConfig(config_id=config_id, provider="fake", model_id="fake-hash", model_version="1", dimensions=dims,
                           input_format="gemini-task-type", normalize=True, timeout_s=1.0, batch_size=50)


class HashEmbedding:
    def __init__(self, *, fail_with: str | None = None, identity_override: dict | None = None) -> None:
        self.fail_with = fail_with
        self.identity_override = identity_override or {}
        self.document_calls = 0
        self.query_calls = 0

    @staticmethod
    def values(text: str, dims: int) -> list[float]:
        vec = [0.0] * dims
        for token in re.findall(r"\w+", text.lower()):
            digest = hashlib.sha256(token.encode()).digest()
            vec[digest[0] % dims] += 1.0 if digest[1] % 2 else -1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def _vector(self, text, config):
        return {"values": self.values(text, config.dimensions), **config.identity(), **self.identity_override}

    def embed_documents(self, texts, config):
        if self.fail_with:
            raise ProviderError(self.fail_with)
        self.document_calls += 1
        return [self._vector(t, config) for t in texts]

    def embed_query(self, query, config):
        self.query_calls += 1
        if self.fail_with:
            raise ProviderError(self.fail_with)
        return self._vector(query, config)
