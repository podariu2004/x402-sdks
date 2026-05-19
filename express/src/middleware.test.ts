import { test } from "node:test";
import assert from "node:assert/strict";
import { x402 } from "./middleware.js";

const cfg = { keyId: "k", secret: "s", baseUrl: "https://p", env: "sandbox" as const };

function res() {
  const r: any = { code: 0, body: undefined, headersSent: false };
  r.status = (c: number) => ((r.code = c), r);
  r.json = (b: unknown) => { r.body = b; r.headersSent = true; return r; };
  return r;
}

function clientStub(over: any) {
  return {
    challenge: async () => over.challenge ?? { status: 200, body: { paymentRequired: true, nonce: "N", amount: "0.10" } },
    verify: async () => over.verify ?? { status: 200, body: { allowed: true } },
  };
}

function recordingStub(over: any) {
  const calls: any = { challenge: null, verify: null };
  return {
    calls,
    client: {
      challenge: async (a: any) => { calls.challenge = a; return over.challenge ?? { status: 200, body: { paymentRequired: true, nonce: "N" } }; },
      verify: async (a: any) => { calls.verify = a; return over.verify ?? { status: 200, body: { allowed: true } }; },
    },
  };
}

test("no proof header → 402 with the challenge body, next NOT called", async () => {
  const mw = x402({ price: "0.10" }, { config: cfg, client: clientStub({}) as any });
  const r = res();
  let nexted = false;
  await mw({ method: "GET", headers: {}, path: "/premium" } as any, r, () => { nexted = true; });
  assert.equal(r.code, 402);
  assert.equal((r.body as any).nonce, "N");
  assert.equal(nexted, false);
});

test("valid proof → verify allowed → next() called, no response written", async () => {
  const mw = x402({}, { config: cfg, client: clientStub({}) as any });
  const r = res();
  let nexted = false;
  await mw(
    { method: "GET", headers: { "x-payment-nonce": "N", "x-payment-payer": "0xabc", "x-payment": '{"p":1}' }, path: "/premium" } as any,
    r,
    () => { nexted = true; },
  );
  assert.equal(nexted, true);
  assert.equal(r.code, 0);
});

test("proof present but verify denies → 402 with reason, next NOT called", async () => {
  const mw = x402({}, { config: cfg, client: clientStub({ verify: { status: 402, body: { allowed: false, reason: "unpaid" } } }) as any });
  const r = res();
  let nexted = false;
  await mw({ method: "GET", headers: { "x-payment-nonce": "N" }, path: "/premium" } as any, r, () => { nexted = true; });
  assert.equal(r.code, 402);
  assert.equal((r.body as any).reason, "unpaid");
  assert.equal(nexted, false);
});

test("platform transport/5xx → 502 fail-closed, content NOT served", async () => {
  const mw = x402({}, { config: cfg, client: clientStub({ challenge: { status: 0, body: {} } }) as any });
  const r = res();
  let nexted = false;
  await mw({ method: "GET", headers: {}, path: "/premium" } as any, r, () => { nexted = true; });
  assert.equal(r.code, 502);
  assert.equal(nexted, false);
});

test("404 no_such_route from challenge is surfaced as 404 (not 502)", async () => {
  const mw = x402({}, { config: cfg, client: clientStub({ challenge: { status: 404, body: { error: "no_such_route" } } }) as any });
  const r = res();
  await mw({ method: "GET", headers: {}, path: "/nope" } as any, r, () => {});
  assert.equal(r.code, 404);
  assert.equal((r.body as any).error, "no_such_route");
});

test("onError hook overrides the fail-closed response", async () => {
  const mw = x402(
    {},
    {
      config: cfg,
      client: clientStub({ verify: { status: 500, body: { allowed: false, reason: "server_error" } } }) as any,
      onError: (_e, _req, r2: any) => r2.status(503).json({ custom: true }),
    },
  );
  const r = res();
  await mw({ method: "GET", headers: { "x-payment-nonce": "N" }, path: "/premium" } as any, r, () => {});
  assert.equal(r.code, 503);
  assert.equal((r.body as any).custom, true);
});

test("opts.route override and req.method are forwarded to the platform", async () => {
  const s = recordingStub({});
  const mw = x402({ route: "/forced" }, { config: cfg, client: s.client as any });
  await mw({ method: "DELETE", headers: {}, path: "/actual" } as any, res(), () => {});
  assert.equal(s.calls.challenge.route, "/forced");
  assert.equal(s.calls.challenge.method, "DELETE");
});

test("invalid x-payment JSON is forwarded to verify as the raw string", async () => {
  const s = recordingStub({});
  const mw = x402({}, { config: cfg, client: s.client as any });
  await mw({ method: "GET", path: "/p", headers: { "x-payment-nonce": "N", "x-payment": "not-json{" } } as any, res(), () => {});
  assert.equal(s.calls.verify.payment_proof, "not-json{");
  assert.equal(s.calls.verify.nonce, "N");
});

test("array-valued proof header takes the first element", async () => {
  const s = recordingStub({});
  const mw = x402({}, { config: cfg, client: s.client as any });
  await mw({ method: "GET", path: "/p", headers: { "x-payment-nonce": ["N1", "N2"] } as any } as any, res(), () => {});
  assert.equal(s.calls.verify.nonce, "N1");
});

test("no-op onError still fails closed (no hang) via the 502 safety net", async () => {
  const r = res();
  const mw = x402({}, { config: cfg, client: clientStub({ challenge: { status: 0, body: {} } }) as any, onError: () => { /* logs only, does not respond */ } });
  let nexted = false;
  await mw({ method: "GET", headers: {}, path: "/p" } as any, r, () => { nexted = true; });
  assert.equal(r.code, 502);     // safety net fired
  assert.equal(nexted, false);
});
