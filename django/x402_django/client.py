"""Platform HTTP client — stdlib only (urllib.request), NO runtime deps.

Fails closed: any transport error / timeout returns status 0 so the gate
never hangs and never serves paid content. The signed body string and the
bytes POSTed are identical (compact JSON, UTF-8, no re-serialization)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from .config import X402Config
from .sign import signed_headers

# A stalled platform connection must fail closed, not hang the payment gate.
REQUEST_TIMEOUT_S = 10.0

# Platform signs over exactly these paths; it MUST be served at domain root.
CHALLENGE_PATH = "/api/v1/challenge"
VERIFY_PATH = "/api/v1/verify"


@dataclass(frozen=True)
class PlatformResponse:
    status: int  # 0 == transport failure (no HTTP response)
    body: dict[str, Any]


def _default_transport(url: str, body_bytes: bytes, headers: dict[str, str]):
    """Real urllib POST. Returns (status, body_string). Raises on transport
    failure / timeout (caller coerces to status 0)."""
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        # An HTTP error response is still a response (e.g. 402/404/500).
        raw = e.read().decode("utf-8", "replace") if e.fp is not None else ""
        return e.code, raw


class PlatformClient:
    def __init__(self, cfg: X402Config, transport=None) -> None:
        self._cfg = cfg
        # transport(url, body_bytes, headers) -> (status, body_string).
        # Tests inject a stub / raising callable.
        self._transport = transport or _default_transport

    def challenge(self, route: str, method: str | None = None) -> PlatformResponse:
        payload: dict[str, Any] = {"route": route}
        if method:
            payload["method"] = method
        return self._post(CHALLENGE_PATH, payload)

    def verify(
        self,
        *,
        route: str,
        method: str | None,
        nonce: str,
        payer: str | None = None,
        payment_proof: Any = None,
    ) -> PlatformResponse:
        payload: dict[str, Any] = {"route": route}
        if method:
            payload["method"] = method
        payload["nonce"] = nonce
        if payer:
            payload["payer"] = payer
        if payment_proof is not None:
            payload["payment_proof"] = payment_proof
        return self._post(VERIFY_PATH, payload)

    def _post(self, path: str, payload: dict[str, Any]) -> PlatformResponse:
        # Compact, insertion-ordered, UTF-8 — the signed body and the wire
        # body are byte-identical across SDKs.
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        body_bytes = body.encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            **signed_headers(self._cfg.key_id, self._cfg.secret, "POST", path, body),
        }
        url = self._cfg.base_url + path
        try:
            status, raw = self._transport(url, body_bytes, headers)
        except Exception:
            return PlatformResponse(status=0, body={})
        if not status:
            return PlatformResponse(status=0, body={})
        try:
            parsed = json.loads(raw) if raw else {}
            if not isinstance(parsed, dict):
                parsed = {}
        except Exception:
            parsed = {}
        return PlatformResponse(status=int(status), body=parsed)
