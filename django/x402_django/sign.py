"""X402v1 signing — replicated byte-for-byte from the frozen contract
(docs/api/x402-contract.md) and the proven Python reference
(sdks/fastapi/x402_fastapi/sign.py). Identical hashlib/hmac logic
guarantees cross-SDK conformance.

    canonical = "X402v1" LF METHOD LF path LF timestamp LF nonce LF sha256hex(body)
      - LF = "\\n" (0x0A), never CRLF
      - METHOD uppercased; path is the platform API path POSTed to
      - timestamp = unix seconds, decimal integer
      - body hashed as UTF-8 bytes, lowercase hex
    signature = HMAC-SHA256(secret, canonical), lowercase hex (64 chars)
"""

from __future__ import annotations

import hashlib
import hmac
import time
import uuid

#: Canonical-string scheme version. MUST match the platform's X402ApiKey::SCHEME.
SCHEME = "X402v1"


def canonical(method: str, path: str, timestamp: int, nonce: str, body: str) -> str:
    # bool is a subclass of int — reject it explicitly so True/False can't pose
    # as a unix timestamp. Floats/NaN/str are likewise rejected (contract §1.2).
    if isinstance(timestamp, bool) or not isinstance(timestamp, int):
        raise ValueError(
            f"x402: timestamp must be an integer (unix seconds); got {timestamp!r}"
        )
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    return "\n".join(
        [SCHEME, method.upper(), path, str(timestamp), nonce, body_hash]
    )


def sign(secret: str, method: str, path: str, timestamp: int, nonce: str, body: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        canonical(method, path, timestamp, nonce, body).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def signed_headers(
    key_id: str, secret: str, method: str, path: str, body: str
) -> dict[str, str]:
    timestamp = int(time.time())
    nonce = str(uuid.uuid4())
    return {
        "X-X402-Key": key_id,
        "X-X402-Timestamp": str(timestamp),
        "X-X402-Nonce": nonce,
        "X-X402-Signature": sign(secret, method, path, timestamp, nonce, body),
    }
