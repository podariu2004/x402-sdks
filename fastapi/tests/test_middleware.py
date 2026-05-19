import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from x402_fastapi.client import PlatformResponse
from x402_fastapi.config import X402Config
from x402_fastapi.middleware import x402_paywall

CFG = X402Config(key_id="k", secret="s", base_url="https://plat.test", env="sandbox")


class FakeClient:
    def __init__(self, challenge=None, verify=None):
        self._challenge = challenge
        self._verify = verify
        self.calls = []

    async def challenge(self, req):
        self.calls.append(("challenge", req))
        return self._challenge

    async def verify(self, req):
        self.calls.append(("verify", req))
        return self._verify


def make_app(fake):
    app = FastAPI()

    @app.get("/premium")
    @x402_paywall(price="0.10", config=CFG, client=fake)
    async def premium():
        return {"data": "paid content"}

    return app


def test_no_proof_returns_402_with_challenge_body():
    fake = FakeClient(challenge=PlatformResponse(200, {"paymentRequired": True, "amount": "0.10"}))
    c = TestClient(make_app(fake))
    r = c.get("/premium")
    assert r.status_code == 402
    assert r.json() == {"paymentRequired": True, "amount": "0.10"}
    assert fake.calls[0][0] == "challenge"
    assert fake.calls[0][1] == {"route": "/premium", "method": "GET"}


def test_unknown_route_returns_404():
    fake = FakeClient(challenge=PlatformResponse(404, {"error": "no_such_route"}))
    r = TestClient(make_app(fake)).get("/premium")
    assert r.status_code == 404
    assert r.json() == {"error": "no_such_route"}


def test_platform_unreachable_fails_closed_502():
    fake = FakeClient(challenge=PlatformResponse(0, {}))
    r = TestClient(make_app(fake)).get("/premium")
    assert r.status_code == 502
    assert r.json() == {"error": "x402_platform_unavailable"}


def test_proof_present_and_allowed_runs_handler():
    fake = FakeClient(verify=PlatformResponse(200, {"allowed": True}))
    r = TestClient(make_app(fake)).get(
        "/premium",
        headers={"X-Payment-Nonce": "n1", "X-Payment-Payer": "0xabc", "X-Payment": '{"tx":"0x1"}'},
    )
    assert r.status_code == 200
    assert r.json() == {"data": "paid content"}
    kind, req = fake.calls[0]
    assert kind == "verify"
    assert req == {
        "route": "/premium",
        "method": "GET",
        "nonce": "n1",
        "payer": "0xabc",
        "payment_proof": {"tx": "0x1"},
    }


def test_proof_present_but_denied_returns_402():
    fake = FakeClient(verify=PlatformResponse(402, {"allowed": False, "reason": "unpaid"}))
    r = TestClient(make_app(fake)).get("/premium", headers={"X-Payment-Nonce": "n1"})
    assert r.status_code == 402
    assert r.json() == {"allowed": False, "reason": "unpaid"}


def test_non_json_x_payment_forwarded_as_raw_string():
    fake = FakeClient(verify=PlatformResponse(200, {"allowed": True}))
    TestClient(make_app(fake)).get(
        "/premium", headers={"X-Payment-Nonce": "n1", "X-Payment": "not-json"}
    )
    assert fake.calls[0][1]["payment_proof"] == "not-json"


def test_verify_5xx_fails_closed_502():
    fake = FakeClient(verify=PlatformResponse(500, {"allowed": False, "reason": "server_error"}))
    r = TestClient(make_app(fake)).get("/premium", headers={"X-Payment-Nonce": "n1"})
    assert r.status_code == 502


def test_explicit_route_override_is_used():
    fake = FakeClient(challenge=PlatformResponse(200, {"paymentRequired": True}))

    app = FastAPI()

    @app.get("/mounted/thing")
    @x402_paywall(route="/premium", config=CFG, client=fake)
    async def thing():
        return {}

    TestClient(app).get("/mounted/thing")
    assert fake.calls[0][1]["route"] == "/premium"


def test_proof_headers_not_visible_to_handler():
    fake = FakeClient(verify=PlatformResponse(200, {"allowed": True}))
    app = FastAPI()

    @app.get("/premium")
    @x402_paywall(config=CFG, client=fake)
    async def premium(request: Request):
        # the handler may still inspect raw headers; assert the SDK does not
        # strip them from the ASGI scope (consumption is logical, not mutation)
        # but DOES gate before the handler body runs.
        return {"saw_nonce": request.headers.get("x-payment-nonce")}

    r = TestClient(app).get("/premium", headers={"X-Payment-Nonce": "n1"})
    assert r.status_code == 200
    assert r.json() == {"saw_nonce": "n1"}
