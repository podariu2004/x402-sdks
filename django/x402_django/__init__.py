"""x402-django — thin, fail-closed Django middleware for the x402 paywall
platform. Implements the frozen X402v1 wire contract (byte-identical
signing to every other x402 SDK)."""

from __future__ import annotations

from .client import PlatformClient, PlatformResponse
from .config import DEFAULT_BASE_URL, X402Config, resolve_config
from .middleware import X402Middleware
from .sign import SCHEME, canonical, sign, signed_headers

__all__ = [
    "X402Middleware",
    "PlatformClient",
    "PlatformResponse",
    "X402Config",
    "resolve_config",
    "DEFAULT_BASE_URL",
    "SCHEME",
    "canonical",
    "sign",
    "signed_headers",
]

__version__ = "0.1.0"
