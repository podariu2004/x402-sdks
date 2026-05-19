import { test } from "node:test";
import assert from "node:assert/strict";
import { x402, PlatformClient } from "./index.js";
import { sign } from "./sign.js";

const cfg = { keyId: "x402_test_k", secret: "x402sk_test_s", baseUrl: "https://p", env: "sandbox" as const };

// Fake platform: re-derives and enforces the X402v1 SIGNATURE + Content-Type exactly like the real server. It intentionally does NOT enforce timestamp skew or nonce single-use — those are platform-side concerns (see contract §1.4), out of scope for an SDK e2e.
function fakePlatform() {
  return async (url: string, init: any): Promise<Response> => {
    const path = url.replace("https://p", "");
    const ts = Number(init.headers["X-X402-Timestamp"]);
    const expected = sign(cfg.secret, "POST", path, ts, init.headers["X-X402-Nonce"], init.body);
    if (init.headers["X-X402-Signature"] !== expected) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
    }
    if (init.headers["content-type"] !== "application/json") {
      return new Response(JSON.stringify({ message: "Unprocessable" }), { status: 422 });
    }
    if (path === "/api/v1/challenge") {
      return new Response(JSON.stringify({
        paymentRequired: true, amount: "0.10", currency: "USDC", network: "base",
        recipient: "0xPLATFORM", resource: JSON.parse(init.body).route, nonce: "NONCE-XYZ",
        expiresAt: "2030-01-01T00:00:00+00:00",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (path === "/api/v1/verify") {
      const b = JSON.parse(init.body);
      if (b.nonce !== "NONCE-XYZ") {
        return new Response(JSON.stringify({ allowed: false, reason: "bad_nonce" }), { status: 402 });
      }
      return new Response(JSON.stringify({ allowed: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  };
}

function res() {
  const r: any = { code: 0, body: undefined, headersSent: false };
  r.status = (c: number) => ((r.code = c), r);
  r.json = (b: unknown) => ((r.body = b), (r.headersSent = true), r);
  return r;
}

test("e2e: unpaid → 402 challenge, signed retry → allowed → next(); wrong nonce → 402 bad_nonce", async () => {
  const client = new PlatformClient(cfg, fakePlatform() as any);
  const mw = x402({ price: "0.10" }, { config: cfg, client });

  // 1. unpaid → 402 with a real challenge body (fake platform verified the signature)
  const r1 = res();
  let n1 = false;
  await mw({ method: "GET", headers: {}, path: "/premium" } as any, r1, () => (n1 = true));
  assert.equal(r1.code, 402);
  assert.equal((r1.body as any).nonce, "NONCE-XYZ");
  assert.equal((r1.body as any).resource, "/premium");
  assert.equal(n1, false);

  // 2. agent retries with proof headers → verify → allowed → next()
  const r2 = res();
  let n2 = false;
  await mw(
    { method: "GET", path: "/premium", headers: { "x-payment-nonce": "NONCE-XYZ", "x-payment": '{"tx":"0x1"}', "x-payment-payer": "0xpayer" } } as any,
    r2,
    () => (n2 = true),
  );
  assert.equal(n2, true);
  assert.equal(r2.code, 0);

  // 3. wrong nonce → 402 bad_nonce, next not called
  const r3 = res();
  let n3 = false;
  await mw({ method: "GET", path: "/premium", headers: { "x-payment-nonce": "WRONG" } } as any, r3, () => (n3 = true));
  assert.equal(r3.code, 402);
  assert.equal((r3.body as any).reason, "bad_nonce");
  assert.equal(n3, false);
});

test("e2e: a signature the platform can't verify → 401 → middleware fails closed (502)", async () => {
  // Client whose fetch tampers the body AFTER signing (signature no longer matches) → platform 401.
  const tampering = async (url: string, init: any) =>
    fakePlatform()(url, { ...init, body: init.body + " " }); // mutate body post-sign
  const client = new PlatformClient(cfg, tampering as any);
  const mw = x402({}, { config: cfg, client });
  const r = res();
  let nexted = false;
  await mw({ method: "GET", headers: {}, path: "/premium" } as any, r, () => (nexted = true));
  assert.equal(r.code, 502);   // 401 from platform → fail closed, content NOT served
  assert.equal(nexted, false);
});

test("e2e: challenge 404 no_such_route surfaces as 404 through the full stack", async () => {
  // fakePlatform returns 404 for any path that isn't /api/v1/challenge|verify;
  // to hit the challenge-404 branch we make the platform treat an unknown
  // route as no_such_route by routing the request to a path the fake 404s.
  const platform = async (url: string, init: any): Promise<Response> => {
    const path = url.replace("https://p", "");
    const ts = Number(init.headers["X-X402-Timestamp"]);
    const { sign } = await import("./sign.js");
    if (init.headers["X-X402-Signature"] !== sign(cfg.secret, "POST", path, ts, init.headers["X-X402-Nonce"], init.body)) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
    }
    // Valid signature, but this merchant has no such route:
    return new Response(JSON.stringify({ error: "no_such_route" }), { status: 404 });
  };
  const { PlatformClient, x402 } = await import("./index.js");
  const client = new PlatformClient(cfg, platform as any);
  const mw = x402({}, { config: cfg, client });
  const r = res();
  let nexted = false;
  await mw({ method: "GET", headers: {}, path: "/unregistered" } as any, r, () => (nexted = true));
  assert.equal(r.code, 404);
  assert.equal((r.body as any).error, "no_such_route");
  assert.equal(nexted, false);
});

test("e2e: verify 402 unpaid surfaces with reason through the full stack", async () => {
  const platform = async (url: string, init: any): Promise<Response> => {
    const path = url.replace("https://p", "");
    const ts = Number(init.headers["X-X402-Timestamp"]);
    const { sign } = await import("./sign.js");
    if (init.headers["X-X402-Signature"] !== sign(cfg.secret, "POST", path, ts, init.headers["X-X402-Nonce"], init.body)) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
    }
    if (path === "/api/v1/challenge") {
      return new Response(JSON.stringify({
        paymentRequired: true, amount: "0.10", currency: "USDC", network: "base",
        recipient: "0xP", resource: JSON.parse(init.body).route, nonce: "N", expiresAt: "2030-01-01T00:00:00+00:00",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    // verify: signature ok but the on-chain payment didn't actually settle
    return new Response(JSON.stringify({ allowed: false, reason: "unpaid" }), { status: 402 });
  };
  const { PlatformClient, x402 } = await import("./index.js");
  const client = new PlatformClient(cfg, platform as any);
  const mw = x402({}, { config: cfg, client });
  const r = res();
  let nexted = false;
  await mw(
    { method: "GET", path: "/premium", headers: { "x-payment-nonce": "N", "x-payment": '{"tx":"0xbad"}' } } as any,
    r, () => (nexted = true),
  );
  assert.equal(r.code, 402);
  assert.equal((r.body as any).reason, "unpaid");
  assert.equal(nexted, false);
});
