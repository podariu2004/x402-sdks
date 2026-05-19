import json

from django.conf import settings
from django.http import HttpResponse
from django.test import RequestFactory

from x402_django.client import PlatformResponse
from x402_django.middleware import X402Middleware

RF = RequestFactory()
SENTINEL = "DOWNSTREAM-SERVED"


def _downstream(request):
    return HttpResponse(SENTINEL)


class StubClient:
    """Records calls and returns a scripted PlatformResponse."""

    def __init__(self, challenge=None, verify=None):
        self._challenge = challenge
        self._verify = verify
        self.calls = []

    def challenge(self, route, method=None):
        self.calls.append(("challenge", route, method))
        return self._challenge

    def verify(self, **kwargs):
        self.calls.append(("verify", kwargs))
        return self._verify


def _mw(client):
    settings.X402_CLIENT = client
    return X402Middleware(_downstream)


def teardown_function():
    if hasattr(settings, "X402_CLIENT"):
        del settings.X402_CLIENT


def test_non_gated_route_passes_through():
    client = StubClient()
    mw = _mw(client)
    resp = mw(RF.get("/public"))
    assert resp.status_code == 200
    assert resp.content == SENTINEL.encode()
    assert client.calls == []  # platform never contacted


def test_no_proof_challenge_200_relayed_as_402():
    client = StubClient(
        challenge=PlatformResponse(status=200, body={"price": "0.10", "challenge": "x"})
    )
    mw = _mw(client)
    resp = mw(RF.get("/premium"))
    assert resp.status_code == 402
    assert json.loads(resp.content) == {"price": "0.10", "challenge": "x"}


def test_no_proof_challenge_404_is_no_such_route():
    client = StubClient(challenge=PlatformResponse(status=404, body={}))
    mw = _mw(client)
    resp = mw(RF.get("/premium"))
    assert resp.status_code == 404
    assert json.loads(resp.content) == {"error": "no_such_route"}


def test_no_proof_challenge_other_status_fails_closed_502():
    client = StubClient(challenge=PlatformResponse(status=500, body={"x": 1}))
    mw = _mw(client)
    resp = mw(RF.get("/premium"))
    assert resp.status_code == 502
    assert json.loads(resp.content) == {"error": "x402_platform_unavailable"}


def test_no_proof_transport_failure_status_0_fails_closed_502():
    client = StubClient(challenge=PlatformResponse(status=0, body={}))
    mw = _mw(client)
    resp = mw(RF.get("/premium"))
    assert resp.status_code == 502
    assert json.loads(resp.content) == {"error": "x402_platform_unavailable"}


def test_with_proof_verify_allowed_passes_through():
    client = StubClient(verify=PlatformResponse(status=200, body={"allowed": True}))
    mw = _mw(client)
    req = RF.get("/premium", HTTP_X_PAYMENT_NONCE="n1", HTTP_X_PAYMENT='{"sig":"abc"}')
    resp = mw(req)
    assert resp.status_code == 200
    assert resp.content == SENTINEL.encode()
    method, kwargs = client.calls[-1]
    assert method == "verify"
    assert kwargs["payment_proof"] == {"sig": "abc"}


def test_with_proof_verify_not_allowed_402():
    client = StubClient(verify=PlatformResponse(status=402, body={"error": "unpaid"}))
    mw = _mw(client)
    req = RF.get("/premium", HTTP_X_PAYMENT_NONCE="n1")
    resp = mw(req)
    assert resp.status_code == 402
    assert json.loads(resp.content) == {"error": "unpaid"}


def test_with_proof_verify_200_not_allowed_fails_closed_502():
    client = StubClient(verify=PlatformResponse(status=200, body={"allowed": False}))
    mw = _mw(client)
    req = RF.get("/premium", HTTP_X_PAYMENT_NONCE="n1")
    resp = mw(req)
    assert resp.status_code == 502
    assert json.loads(resp.content) == {"error": "x402_platform_unavailable"}


def test_with_proof_verify_transport_failure_fails_closed_502():
    client = StubClient(verify=PlatformResponse(status=0, body={}))
    mw = _mw(client)
    req = RF.get("/premium", HTTP_X_PAYMENT_NONCE="n1")
    resp = mw(req)
    assert resp.status_code == 502
    assert json.loads(resp.content) == {"error": "x402_platform_unavailable"}
