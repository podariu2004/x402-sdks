import { test } from "node:test";
import assert from "node:assert/strict";
import { PlatformClient } from "./client.js";
import { sign } from "./sign.js";

function fakeFetch(capture: any[]) {
  return async (url: string, init: any) => {
    capture.push({ url, init });
    if (url === "https://platform.example/api/v1/challenge") {
      return new Response(
        JSON.stringify({ paymentRequired: true, amount: "0.10", nonce: "N1" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ allowed: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

const cfg = {
  keyId: "x402_test_abc",
  secret: "x402sk_test_x",
  baseUrl: "https://platform.example",
  env: "sandbox" as const,
};

test("challenge() POSTs signed to /api/v1/challenge and returns parsed body", async () => {
  const cap: any[] = [];
  const c = new PlatformClient(cfg, fakeFetch(cap) as any);
  const res = await c.challenge({ route: "/premium", method: "GET" });

  assert.equal(res.status, 200);
  assert.equal(res.body.nonce, "N1");
  const { url, init } = cap[0];
  assert.equal(url, "https://platform.example/api/v1/challenge");
  assert.equal(init.method, "POST");
  const ts = Number(init.headers["X-X402-Timestamp"]);
  assert.equal(
    init.headers["X-X402-Signature"],
    sign(cfg.secret, "POST", "/api/v1/challenge", ts, init.headers["X-X402-Nonce"], init.body),
  );
  assert.equal(init.headers["X-X402-Key"], cfg.keyId);
  assert.equal(init.headers["content-type"], "application/json");
});

test("verify() POSTs signed to /api/v1/verify with the proof payload", async () => {
  const cap: any[] = [];
  const c = new PlatformClient(cfg, fakeFetch(cap) as any);
  const res = await c.verify({ route: "/premium", nonce: "N1", payer: "0xabc", payment_proof: { p: 1 } });

  assert.equal(res.status, 200);
  assert.equal(res.body.allowed, true);
  const { url, init } = cap[0];
  assert.equal(url, "https://platform.example/api/v1/verify");
  assert.deepEqual(JSON.parse(init.body), {
    route: "/premium",
    nonce: "N1",
    payer: "0xabc",
    payment_proof: { p: 1 },
  });
});

test("network failure surfaces as status 0 (caller fails closed)", async () => {
  const c = new PlatformClient(cfg, (async () => {
    throw new Error("ECONNREFUSED");
  }) as any);
  const res = await c.challenge({ route: "/x" });
  assert.equal(res.status, 0);
});

test("non-2xx responses pass through as {status, body} for the middleware to branch", async () => {
  const make = (status: number, body: unknown) =>
    new PlatformClient(cfg, (async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as any);

  const r401 = await make(401, { error: "invalid_signature" }).challenge({ route: "/p" });
  assert.equal(r401.status, 401);
  assert.equal((r401.body as any).error, "invalid_signature");

  const r402 = await make(402, { allowed: false, reason: "unpaid" }).verify({ route: "/p", nonce: "n" });
  assert.equal(r402.status, 402);
  assert.equal((r402.body as any).reason, "unpaid");

  const r500 = await make(500, { allowed: false, reason: "server_error" }).verify({ route: "/p", nonce: "n" });
  assert.equal(r500.status, 500);
  assert.equal((r500.body as any).reason, "server_error");
});

test("a 200 with a non-JSON body yields body {} (no throw)", async () => {
  const c = new PlatformClient(cfg, (async () =>
    new Response("not json", { status: 200, headers: { "content-type": "text/plain" } })) as any);
  const r = await c.challenge({ route: "/p" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {});
});
