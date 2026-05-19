import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { canonical, sign, signedHeaders } from "./sign.js";

test("canonical string is the frozen X402v1 layout", () => {
  const c = canonical("post", "/api/v1/verify", 1700000000, "nonce-1", '{"a":1}');
  const expected =
    "X402v1\nPOST\n/api/v1/verify\n1700000000\nnonce-1\n" +
    createHash("sha256").update('{"a":1}').digest("hex");
  assert.equal(c, expected);
});

test("empty body hashes to sha256('')", () => {
  const c = canonical("GET", "/api/v1/challenge", 1, "n", "");
  assert.ok(c.endsWith("\n" + createHash("sha256").update("").digest("hex")));
});

test("sign is lowercase-hex HMAC-SHA256 of the canonical string", () => {
  const secret = "x402sk_test_deadbeef";
  const got = sign(secret, "POST", "/api/v1/verify", 1700000000, "nonce-1", '{"a":1}');
  const expected = createHmac("sha256", secret)
    .update(
      "X402v1\nPOST\n/api/v1/verify\n1700000000\nnonce-1\n" +
        createHash("sha256").update('{"a":1}').digest("hex"),
    )
    .digest("hex");
  assert.equal(got, expected);
  assert.match(got, /^[0-9a-f]{64}$/);
  // KAT (known-answer): SP-5 SDKs MUST reproduce this exact hex for these
  // exact inputs. Proven byte-identical to the PHP platform's X402ApiKey::sign.
  assert.equal(got, "c325bfaf7e66735f1e6a977b4b3b3fa6c9ae98d010123b1f724bed5ce5959ab5");
});

test("signedHeaders returns the four X-X402 headers with a fresh nonce", () => {
  const h = signedHeaders("x402_test_abc", "x402sk_test_x", "POST", "/api/v1/challenge", '{"route":"/p"}');
  assert.equal(h["X-X402-Key"], "x402_test_abc");
  assert.match(h["X-X402-Timestamp"], /^\d+$/);
  assert.ok(h["X-X402-Nonce"].length >= 16);
  assert.match(h["X-X402-Signature"], /^[0-9a-f]{64}$/);
  const ts = Number(h["X-X402-Timestamp"]);
  assert.equal(
    h["X-X402-Signature"],
    sign("x402sk_test_x", "POST", "/api/v1/challenge", ts, h["X-X402-Nonce"], '{"route":"/p"}'),
  );
});

test("unicode body hashes utf-8 bytes", () => {
  const body = '{"name":"こんにちは"}';
  const c = canonical("POST", "/api/v1/verify", 1700000000, "n", body);
  const expected = createHash("sha256").update(body, "utf8").digest("hex");
  assert.ok(c.endsWith("\n" + expected));
});

test("canonical rejects a non-integer timestamp", () => {
  assert.throws(() => canonical("POST", "/p", 1700000000.5, "n", ""), RangeError);
  assert.throws(() => canonical("POST", "/p", Number.NaN, "n", ""), RangeError);
});

test("signedHeaders nonces are unique across calls", () => {
  const h1 = signedHeaders("k", "s", "POST", "/api/v1/challenge", "");
  const h2 = signedHeaders("k", "s", "POST", "/api/v1/challenge", "");
  assert.notEqual(h1["X-X402-Nonce"], h2["X-X402-Nonce"]);
});
