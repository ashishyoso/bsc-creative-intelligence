"""ULID generation + small helpers used across the Inspiration module."""
from __future__ import annotations

import os
import secrets
import time

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def ulid() -> str:
    """26-char Crockford-base32 ULID (48-bit timestamp ms + 80-bit random).

    Lexicographically sortable. Used as primary key across all Inspiration
    tables — matches the spec's mandate of ULID for all FK joins (US-1.1).
    """
    ts_ms = int(time.time() * 1000)
    rand = secrets.token_bytes(10)
    n = (ts_ms << 80) | int.from_bytes(rand, "big")
    out = []
    for _ in range(26):
        out.append(_CROCKFORD[n & 0x1F])
        n >>= 5
    return "".join(reversed(out))


def env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


def env_required(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Required env var {name} is not set")
    return v
