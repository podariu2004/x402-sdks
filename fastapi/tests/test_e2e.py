"""One real end-to-end pass against a mocked platform: the agent hits the
gate with no proof (→402 challenge), 'pays', retries with the nonce (→allow).
Exercises decorator + client + sign together, no network."""

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from x402_fastapi.client import PlatformClient
from x402_fastapi.config import X402Config
from x402_fastapi.middleware import x402_paywall

CFG = X402Config(key_id="x402_test_k", secret="x402sk_test_s", base_url="https://plat.test", env="sandbox")


def platform_transport():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/challenge":
            return httpx.Response(200, json={
                "paymentRequired": True, "amount": "0.10", "currency": "USDC",
                "network": "base", "recipient": "0xPLAT", "resource": "/premium",
                "nonce": "chal-nonce-1", "expiresAt": "2030-01-01T00:00:00+00:00",
            })
        if request.url.path == "/api/v1/verify":
            import json as _j
            sent = _j.loads(request.content)
            ok = sent.get("nonce") == "chal-nonce-1"
            return httpx.Response(200 if ok else 402, json=(
                {"allowed": True} if ok else {"allowed": False, "reason": "bad_nonce"}
            ))
        return httpx.Response(404, json={"error": "no_such_route"})
    return httpx.MockTransport(handler)


def test_full_test_mode_flow():
    http = httpx.AsyncClient(transport=platform_transport())
    client = PlatformClient(CFG, http)

    app = FastAPI()

    @app.get("/premium")
    @x402_paywall(price="0.10", config=CFG, client=client)
    async def premium():
        return {"data": "paid content"}

    c = TestClient(app)

    first = c.get("/premium")
    assert first.status_code == 402
    challenge = first.json()
    assert challenge["paymentRequired"] is True
    assert challenge["nonce"] == "chal-nonce-1"

    paid = c.get("/premium", headers={"X-Payment-Nonce": challenge["nonce"]})
    assert paid.status_code == 200
    assert paid.json() == {"data": "paid content"}
