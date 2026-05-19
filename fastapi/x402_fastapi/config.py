"""Config resolution — mirrors sdks/express/src/config.ts (same env vars)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping

# TODO: replace with the production platform domain before GA (kept identical
# to the Express reference default so all SDKs point at the same place).
DEFAULT_BASE_URL = "https://api.x402.dev"


@dataclass(frozen=True)
class X402Config:
    key_id: str
    secret: str
    base_url: str
    env: str  # "production" | "sandbox"


def resolve_config(env: Mapping[str, str | None] | None = None) -> X402Config:
    env = os.environ if env is None else env
    key_id = env.get("X402_API_KEY")
    secret = env.get("X402_SECRET")
    if not key_id or not secret:
        raise RuntimeError(
            "x402: X402_API_KEY and X402_SECRET must be set (server-side env)."
        )
    mode = (env.get("X402_ENV") or "production").lower()
    base_url = (env.get("X402_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    return X402Config(
        key_id=key_id,
        secret=secret,
        base_url=base_url,
        env="sandbox" if mode == "sandbox" else "production",
    )
