import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonical, sign, signedHeaders, SCHEME } from "./sign.js";

// Tests run in Node (not Edge), so reading the shared vector file here is fine.
const VECTORS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../docs/api/x402-conformance-vectors.json", import.meta.url)),
    "utf8",
  ),
);

test("SCHEME is frozen", () => {
  assert.equal(SCHEME, "X402v1");
});

test("canonical is the frozen X402v1 layout", async () => {
  const c = await canonical("post", "/api/v1/verify", 1700000000, "nonce-1", '{"a":1}');
  assert.equal(c, VECTORS.kat.canonical);
});

test("empty body hashes to sha256('')", async () => {
  const c = await canonical("GET", "/api/v1/challenge", 1, "n", "");
  assert.ok(c.endsWith("\n" + VECTORS.body_hashes[0].sha256));
});

test("KAT signature matches the frozen shared vector", async () => {
  const k = VECTORS.kat;
  const got = await sign(k.secret, k.method, k.path, k.timestamp, k.nonce, k.body);
  assert.match(got, /^[0-9a-f]{64}$/);
  assert.equal(got, k.signature);
});

test("unicode body hashes utf-8 bytes", async () => {
  const body = '{"name":"こんにちは"}';
  const c = await canonical("POST", "/api/v1/verify", 1700000000, "n", body);
  // recompute independently via Web Crypto
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  assert.ok(c.endsWith("\n" + hex));
});

test("canonical rejects a non-integer timestamp", async () => {
  await assert.rejects(() => canonical("POST", "/p", 1700000000.5, "n", ""), RangeError);
  await assert.rejects(() => canonical("POST", "/p", Number.NaN, "n", ""), RangeError);
});

test("signedHeaders returns the four headers with a fresh nonce", async () => {
  const h = await signedHeaders("x402_test_abc", "x402sk_test_x", "POST", "/api/v1/challenge", '{"route":"/p"}');
  assert.equal(h["X-X402-Key"], "x402_test_abc");
  assert.match(h["X-X402-Timestamp"], /^\d+$/);
  assert.ok(h["X-X402-Nonce"].length >= 16);
  assert.match(h["X-X402-Signature"], /^[0-9a-f]{64}$/);
  const ts = Number(h["X-X402-Timestamp"]);
  assert.equal(
    h["X-X402-Signature"],
    await sign("x402sk_test_x", "POST", "/api/v1/challenge", ts, h["X-X402-Nonce"], '{"route":"/p"}'),
  );
});

test("signedHeaders nonces are unique across calls", async () => {
  const a = await signedHeaders("k", "s", "POST", "/api/v1/challenge", "");
  const b = await signedHeaders("k", "s", "POST", "/api/v1/challenge", "");
  assert.notEqual(a["X-X402-Nonce"], b["X-X402-Nonce"]);
});

test("shared vectors full conformance (cross-SDK drift gate)", async () => {
  for (const v of VECTORS.body_hashes) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v.body));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    assert.equal(hex, v.sha256);
  }
  const k = VECTORS.kat;
  assert.equal(await canonical(k.method, k.path, k.timestamp, k.nonce, k.body), k.canonical);
  assert.equal(await sign(k.secret, k.method, k.path, k.timestamp, k.nonce, k.body), k.signature);
});
