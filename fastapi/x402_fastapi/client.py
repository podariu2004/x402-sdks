"""Platform HTTP client — mirrors sdks/express/src/client.ts.

Fails closed: any transport error / timeout returns status 0 so the gate
never hangs and never serves paid content. The signed body string and the
bytes POSTed are identical (compact JSON, UTF-8, no re-serialization)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from .config import X402Config
from .sign import signed_headers

# A stalled platform connection must fail closed, not hang the payment gate.
REQUEST_TIMEOUT_S = 10.0

# Platform signs over getPathInfo() == exactly these paths (Laravel 'api'
# prefix included). The platform MUST be served at domain root.
CHALLENGE_PATH = "/api/v1/challenge"
VERIFY_PATH = "/api/v1/verify"


@dataclass(frozen=True)
class PlatformResponse:
    status: int  # 0 == transport failure (no HTTP response)
    body: dict[str, Any]


class PlatformClient:
    def __init__(self, cfg: X402Config, http: httpx.AsyncClient | None = None) -> None:
        self._cfg = cfg
        self._http = http  # injected in tests; created per-call otherwise

    async def challenge(self, req: dict[str, Any]) -> PlatformResponse:
        return await self._post(CHALLENGE_PATH, req)

    async def verify(self, req: dict[str, Any]) -> PlatformResponse:
        return await self._post(VERIFY_PATH, req)

    async def _post(self, path: str, payload: dict[str, Any]) -> PlatformResponse:
        # Compact, insertion-ordered, UTF-8 — byte-identical to JS JSON.stringify
        # so the signed body and the wire body match across SDKs.
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        body_bytes = body.encode("utf-8")
        headers = {
            "content-type": "application/json",
            **signed_headers(self._cfg.key_id, self._cfg.secret, "POST", path, body),
        }
        url = self._cfg.base_url + path
        try:
            if self._http is not None:
                resp = await self._http.post(url, content=body_bytes, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as http:
                    resp = await http.post(url, content=body_bytes, headers=headers)
            try:
                parsed = resp.json()
                if not isinstance(parsed, dict):
                    parsed = {}
            except Exception:
                parsed = {}
            return PlatformResponse(status=resp.status_code, body=parsed)
        except Exception:
            return PlatformResponse(status=0, body={})
