"""Service authentication profile LI-HMAC-SHA256-v1 (contracts/agent-v1.md 12.9, decision 12.13 #5 of 06/11/2026).

Standard library only, so Core can implement the same profile with node:crypto and check the shared vectors in
contracts/fixtures/hmac-v1.json. One key per direction (Core -> Agent, Agent -> Core), looked up by key id; old keys
stay verify-only during a rotation. Keys come from configuration (credential volume), never from Git, prompts,
checkpoints or logs, and neither signatures nor bodies are logged.

    string to sign = "LI-HMAC-SHA256-v1\\n" METHOD "\\n" path+query "\\n" timestamp "\\n" nonce "\\n" sha256(body) "\\n" key id
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import time
from dataclasses import dataclass
from typing import Callable, Mapping, Protocol

PROFILE = "LI-HMAC-SHA256-v1"
MAX_BODY_BYTES = 1024 * 1024
SKEW_SECONDS = 120
NONCE_WINDOW_SECONDS = 600
MIN_KEY_BYTES = 32

H_KEY_ID = "X-LI-Key-Id"
H_TIMESTAMP = "X-LI-Timestamp"
H_NONCE = "X-LI-Nonce"
H_CONTENT = "X-LI-Content-SHA256"
H_SIGNATURE = "X-LI-Signature"
HEADERS = (H_KEY_ID, H_TIMESTAMP, H_NONCE, H_CONTENT, H_SIGNATURE)

_KEY_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_NONCE = re.compile(r"^[A-Za-z0-9_-]{22}$")  # 16 random bytes, base64url without padding
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_B64URL = re.compile(r"^[A-Za-z0-9_-]{43}$")  # 32-byte HMAC, base64url without padding


class AuthFailed(Exception):
    """Any mismatch. The reason stays internal (tests); responses only say AUTH_FAILED."""

    code = "AUTH_FAILED"

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class ReplayRejected(AuthFailed):
    code = "REPLAY_REJECTED"


class NonceStore(Protocol):
    def remember_nonce(self, key_id: str, nonce: str, window_s: int) -> bool:
        """Durably record (key_id, nonce); False when it was already seen inside the window."""


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def content_sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def string_to_sign(method: str, target: str, timestamp: str, nonce: str, digest: str, key_id: str) -> bytes:
    return "\n".join((PROFILE, method.upper(), target, timestamp, nonce, digest, key_id)).encode("utf-8")


def signature(key: bytes, method: str, target: str, timestamp: str, nonce: str, digest: str, key_id: str) -> str:
    return b64url(hmac.new(key, string_to_sign(method, target, timestamp, nonce, digest, key_id), hashlib.sha256).digest())


@dataclass(frozen=True)
class Keyring:
    """Signing key (current) plus verify-only keys kept during a rotation. Each direction has its own keyring."""

    current_id: str
    keys: Mapping[str, bytes]

    def __post_init__(self) -> None:
        if self.current_id not in self.keys:
            raise ValueError("current key id is not in the keyring")
        for key_id, key in self.keys.items():
            if not _KEY_ID.match(key_id):
                raise ValueError("invalid key id")
            if len(key) < MIN_KEY_BYTES:
                raise ValueError("HMAC keys must be at least 32 random bytes")

    @classmethod
    def from_config(cls, current_id: str, encoded: Mapping[str, str]) -> "Keyring":
        """Keys as base64url strings (as stored in the env/credential file)."""
        return cls(current_id, {k: base64.urlsafe_b64decode(v + "=" * (-len(v) % 4)) for k, v in encoded.items()})

    @property
    def current_key(self) -> bytes:
        return self.keys[self.current_id]


def sign(keyring: Keyring, method: str, target: str, body: bytes, *, now: float | None = None,
         nonce: str | None = None) -> dict[str, str]:
    """Headers for one send. Every resend signs again with a new timestamp and nonce; business IDs stay the same."""
    if len(body) > MAX_BODY_BYTES:
        raise ValueError("body larger than 1 MiB")
    timestamp = str(int(time.time() if now is None else now))
    nonce = nonce or b64url(secrets.token_bytes(16))
    digest = content_sha256(body)
    return {H_KEY_ID: keyring.current_id, H_TIMESTAMP: timestamp, H_NONCE: nonce, H_CONTENT: digest,
            H_SIGNATURE: signature(keyring.current_key, method, target, timestamp, nonce, digest, keyring.current_id)}


def verify(keyring: Keyring, nonces: NonceStore, method: str, target: str, headers: Mapping[str, str], body: bytes,
           *, now: Callable[[], float] = time.time) -> str:
    """Check one request on the raw body bytes (before JSON parsing). Returns the key id. The nonce is recorded only
    after the signature is valid, so unauthenticated traffic cannot fill the nonce table."""
    lower = {k.lower(): v for k, v in headers.items()}
    values = {h: lower.get(h.lower()) for h in HEADERS}
    if any(v is None for v in values.values()):
        raise AuthFailed("missing header")
    key_id, timestamp, nonce = values[H_KEY_ID], values[H_TIMESTAMP], values[H_NONCE]
    if len(body) > MAX_BODY_BYTES:
        raise AuthFailed("body too large")
    if not (_KEY_ID.match(key_id) and timestamp.isdigit() and _NONCE.match(nonce) and _HEX64.match(values[H_CONTENT])
            and _B64URL.match(values[H_SIGNATURE])):
        raise AuthFailed("malformed header")
    key = keyring.keys.get(key_id)
    if key is None:
        raise AuthFailed("unknown key")
    if abs(now() - int(timestamp)) > SKEW_SECONDS:
        raise AuthFailed("clock skew")
    digest = content_sha256(body)
    if not hmac.compare_digest(digest, values[H_CONTENT]):
        raise AuthFailed("content digest")
    expected = signature(key, method, target, timestamp, nonce, digest, key_id)
    if not hmac.compare_digest(expected.encode("ascii"), values[H_SIGNATURE].encode("ascii")):
        raise AuthFailed("signature")
    if not nonces.remember_nonce(key_id, nonce, NONCE_WINDOW_SECONDS):
        raise ReplayRejected("nonce seen")
    return key_id


class MemoryNonces:
    """Nonce store for unit tests only; the service uses agent_runtime.request_nonces (durable)."""

    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        self._seen: dict[tuple[str, str], float] = {}
        self._clock = clock

    def remember_nonce(self, key_id: str, nonce: str, window_s: int) -> bool:
        now = self._clock()
        self._seen = {k: t for k, t in self._seen.items() if now - t < window_s}
        if (key_id, nonce) in self._seen:
            return False
        self._seen[(key_id, nonce)] = now
        return True


__all__ = ["AuthFailed", "HEADERS", "Keyring", "MAX_BODY_BYTES", "MemoryNonces", "NonceStore", "PROFILE",
           "ReplayRejected", "content_sha256", "sign", "signature", "string_to_sign", "verify"]
