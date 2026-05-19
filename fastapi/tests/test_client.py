import hashlib

import httpx
import pytest

from x402_fastapi.client import PlatformClient
from x402_fastapi.config import X402Config

CFG = X402Config(key_id="x402_test_k", secret="x402sk_test_s", base_url="https://plat.test", env="sandbox")


@pytest.mark.asyncio
async def test_post_signs_over_exact_body_bytes_and_path():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = request.content
        captured["headers"] = {k.lower(): v for k, v in request.headers.items()}
        return httpx.Response(200, json={"paymentRequired": True})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http:
        client = PlatformClient(CFG, http)
        resp = await client.challenge({"route": "/premium", "method": "GET"})

    assert resp.status == 200
    assert resp.body["paymentRequired"] is True
    assert captured["url"] == "https://plat.test/api/v1/challenge"
    # Body is compact JSON; signature is over those exact bytes.
    assert captured["body"] == b'{"route":"/premium","method":"GET"}'
    h = captured["headers"]
    assert h["content-type"] == "application/json"
    assert h["x-x402-key"] == "x402_test_k"
    body_hash = hashlib.sha256(captured["body"]).hexdigest()
    from x402_fastapi.sign import sign

    assert h["x-x402-signature"] == sign(
        "x402sk_test_s", "POST", "/api/v1/verify".replace("verify", "challenge"),
        int(h["x-x402-timestamp"]), h["x-x402-nonce"], captured["body"].decode(),
    )


@pytest.mark.asyncio
async def test_unicode_payload_is_utf8_not_ascii_escaped():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.content
        return httpx.Response(200, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await PlatformClient(CFG, http).verify({"route": "/п", "method": "GET", "nonce": "n"})
    # ensure_ascii=False ⇒ raw UTF-8 bytes (byte-match JS JSON.stringify)
    assert "п".encode("utf-8") in captured["body"]


@pytest.mark.asyncio
async def test_transport_failure_is_status_zero_fail_closed():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        resp = await PlatformClient(CFG, http).verify({"route": "/p", "method": "GET", "nonce": "n"})
    assert resp.status == 0
    assert resp.body == {}


@pytest.mark.asyncio
async def test_non_json_response_body_is_empty_dict():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="upstream exploded")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        resp = await PlatformClient(CFG, http).challenge({"route": "/p", "method": "GET"})
    assert resp.status == 500
    assert resp.body == {}
