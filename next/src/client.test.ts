import { test } from "node:test";
import assert from "node:assert/strict";
import { PlatformClient } from "./client.js";
import type { X402Config } from "./config.js";
import { sign } from "./sign.js";

const CFG: X402Config = {
  keyId: "x402_test_k",
  secret: "x402sk_test_s",
  baseUrl: "https://plat.test",
  env: "sandbox",
};

test("post signs over the exact body bytes and the right path", async () => {
  let captured: { url: string; body: string; headers: Record<string, string> } | undefined;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    captured = {
      url,
      body: init.body as string,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
    };
    return new Response(JSON.stringify({ paymentRequired: true }), { status: 200 });
  }) as unknown as typeof fetch;

  const client = new PlatformClient(CFG, fakeFetch);
  const r = await client.challenge({ route: "/premium", method: "GET" });

  assert.equal(r.status, 200);
  assert.equal((r.body as { paymentRequired: boolean }).paymentRequired, true);
  assert.equal(captured!.url, "https://plat.test/api/v1/challenge");
  assert.equal(captured!.body, '{"route":"/premium","method":"GET"}');
  assert.equal(captured!.headers["content-type"], "application/json");
  assert.equal(captured!.headers["x-x402-key"], "x402_test_k");
  const ts = Number(captured!.headers["x-x402-timestamp"]);
  assert.equal(
    captured!.headers["x-x402-signature"],
    await sign("x402sk_test_s", "POST", "/api/v1/challenge", ts, captured!.headers["x-x402-nonce"], captured!.body),
  );
});

test("transport failure is status 0 (fail closed)", async () => {
  const fakeFetch = (async () => {
    throw new Error("boom");
  }) as unknown as typeof fetch;
  const r = await new PlatformClient(CFG, fakeFetch).verify({ route: "/p", method: "GET", nonce: "n" });
  assert.equal(r.status, 0);
  assert.deepEqual(r.body, {});
});

test("non-json response body becomes {}", async () => {
  const fakeFetch = (async () =>
    new Response("upstream exploded", { status: 500 })) as unknown as typeof fetch;
  const r = await new PlatformClient(CFG, fakeFetch).challenge({ route: "/p", method: "GET" });
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, {});
});

test("json array/scalar/null response body is coerced to {}", async () => {
  for (const payload of ["[1,2,3]", "42", "null"]) {
    const fakeFetch = (async () =>
      new Response(payload, {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const r = await new PlatformClient(CFG, fakeFetch).verify({
      route: "/p",
      method: "GET",
      nonce: "n",
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {});
  }
});
