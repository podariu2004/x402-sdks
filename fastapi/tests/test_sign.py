import hashlib
import hmac
import json
import re
from pathlib import Path

import pytest

from x402_fastapi.sign import SCHEME, canonical, sign, signed_headers

VECTORS = json.loads(
    (Path(__file__).resolve().parents[3] / "docs/api/x402-conformance-vectors.json").read_text()
)


def test_scheme_is_frozen():
    assert SCHEME == "X402v1"


def test_canonical_is_the_frozen_layout():
    c = canonical("post", "/api/v1/verify", 1700000000, "nonce-1", '{"a":1}')
    expected = (
        "X402v1\nPOST\n/api/v1/verify\n1700000000\nnonce-1\n"
        + hashlib.sha256(b'{"a":1}').hexdigest()
    )
    assert c == expected
    assert c == VECTORS["kat"]["canonical"]


def test_empty_body_hashes_to_sha256_empty():
    c = canonical("GET", "/api/v1/challenge", 1, "n", "")
    assert c.endswith("\n" + hashlib.sha256(b"").hexdigest())
    assert c.endswith("\n" + VECTORS["body_hashes"][0]["sha256"])


def test_kat_signature_matches_frozen_vector():
    kat = VECTORS["kat"]
    got = sign(kat["secret"], kat["method"], kat["path"], kat["timestamp"], kat["nonce"], kat["body"])
    assert re.fullmatch(r"[0-9a-f]{64}", got)
    assert got == kat["signature"]


def test_unicode_body_hashes_utf8_bytes():
    body = '{"name":"こんにちは"}'
    c = canonical("POST", "/api/v1/verify", 1700000000, "n", body)
    assert c.endswith("\n" + hashlib.sha256(body.encode("utf-8")).hexdigest())


@pytest.mark.parametrize("bad", [1700000000.5, float("nan"), True, "1700000000"])
def test_canonical_rejects_non_integer_timestamp(bad):
    with pytest.raises((ValueError, TypeError)):
        canonical("POST", "/p", bad, "n", "")


def test_signed_headers_returns_the_four_headers_with_fresh_nonce():
    h = signed_headers("x402_test_abc", "x402sk_test_x", "POST", "/api/v1/challenge", '{"route":"/p"}')
    assert h["X-X402-Key"] == "x402_test_abc"
    assert re.fullmatch(r"\d+", h["X-X402-Timestamp"])
    assert len(h["X-X402-Nonce"]) >= 16
    assert re.fullmatch(r"[0-9a-f]{64}", h["X-X402-Signature"])
    ts = int(h["X-X402-Timestamp"])
    assert h["X-X402-Signature"] == sign(
        "x402sk_test_x", "POST", "/api/v1/challenge", ts, h["X-X402-Nonce"], '{"route":"/p"}'
    )


def test_signed_headers_nonces_are_unique():
    a = signed_headers("k", "s", "POST", "/api/v1/challenge", "")
    b = signed_headers("k", "s", "POST", "/api/v1/challenge", "")
    assert a["X-X402-Nonce"] != b["X-X402-Nonce"]


def test_shared_vectors_full_conformance():
    """The cross-SDK drift gate: every body_hash + the KAT signature in the
    shared vector file MUST reproduce exactly. Identical assertion shape will
    be used by the Next.js/Laravel/Go SDKs."""
    import hashlib as _h

    for v in VECTORS["body_hashes"]:
        assert _h.sha256(v["body"].encode("utf-8")).hexdigest() == v["sha256"]

    kat = VECTORS["kat"]
    assert canonical(kat["method"], kat["path"], kat["timestamp"], kat["nonce"], kat["body"]) == kat["canonical"]
    assert sign(kat["secret"], kat["method"], kat["path"], kat["timestamp"], kat["nonce"], kat["body"]) == kat["signature"]
