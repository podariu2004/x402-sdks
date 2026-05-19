import { test } from "node:test";
import assert from "node:assert/strict";
import { withX402 } from "./middleware.js";
import type { X402Config } from "./config.js";
import type { PlatformResponse, ChallengeBody, VerifyBody } from "./types.js";

const CFG: X402Config = { keyId: "k", secret: "s", baseUrl: "https://plat.test", env: "sandbox" };

class FakeClient {
  calls: Array<[string, unknown]> = [];
  constructor(
    private ch?: PlatformResponse<ChallengeBody>,
    private vr?: PlatformResponse<VerifyBody>,
  ) {}
  async challenge(req: unknown) {
    this.calls.push(["challenge", req]);
    return this.ch!;
  }
  async verify(req: unknown) {
    this.calls.push(["verify", req]);
    return this.vr!;
  }
}

const handler = async () => Response.json({ data: "paid content" });

test("no proof → 402 with challenge body", async () => {
  const fake = new FakeClient({ status: 200, body: { paymentRequired: true, amount: "0.10" } as ChallengeBody });
  const route = withX402(handler, { price: "0.10", config: CFG, client: fake as never });
  const res = await route(new Request("https://m.test/premium"));
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json(), { paymentRequired: true, amount: "0.10" });
  assert.deepEqual(fake.calls[0], ["challenge", { route: "/premium", method: "GET" }]);
});

test("unknown route → 404", async () => {
  const fake = new FakeClient({ status: 404, body: { error: "no_such_route" } as unknown as ChallengeBody });
  const route = withX402(handler, { config: CFG, client: fake as never });
  const res = await route(new Request("https://m.test/premium"));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "no_such_route" });
});

test("platform unreachable → fail closed 502", async () => {
  const fake = new FakeClient({ status: 0, body: {} as ChallengeBody });
  const route = withX402(handler, { config: CFG, client: fake as never });
  const res = await route(new Request("https://m.test/premium"));
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: "x402_platform_unavailable" });
});

test("proof present + allowed → runs handler", async () => {
  const fake = new FakeClient(undefined, { status: 200, body: { allowed: true } });
  const route = withX402(handler, { config: CFG, client: fake as never });
  const res = await route(
    new Request("https://m.test/premium", {
      headers: { "X-Payment-Nonce": "n1", "X-Payment-Payer": "0xabc", "X-Payment": '{"tx":"0x1"}' },
    }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { data: "paid content" });
  assert.deepEqual(fake.calls[0], [
    "verify",
    { route: "/premium", method: "GET", nonce: "n1", payer: "0xabc", payment_proof: { tx: "0x1" } },
  ]);
});

test("proof present + denied → 402 body", async () => {
  const fake = new FakeClient(undefined, { status: 402, body: { allowed: false, reason: "unpaid" } });
  const route = withX402(handler, { config: CFG, client: fake as never });
  const res = await route(new Request("https://m.test/premium", { headers: { "X-Payment-Nonce": "n1" } }));
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json(), { allowed: false, reason: "unpaid" });
});

test("non-json X-Payment forwarded as raw string", async () => {
  const fake = new FakeClient(undefined, { status: 200, body: { allowed: true } });
  const route = withX402(handler, { config: CFG, client: fake as never });
  await route(new Request("https://m.test/premium", { headers: { "X-Payment-Nonce": "n1", "X-Payment": "not-json" } }));
  assert.equal((fake.calls[0][1] as { payment_proof: unknown }).payment_proof, "not-json");
});

test("verify 5xx → fail closed 502", async () => {
  const fake = new FakeClient(undefined, { status: 500, body: { allowed: false, reason: "server_error" } });
  const route = withX402(handler, { config: CFG, client: fake as never });
  const res = await route(new Request("https://m.test/premium", { headers: { "X-Payment-Nonce": "n1" } }));
  assert.equal(res.status, 502);
});

test("allowed must be strictly true (not truthy)", async () => {
  const fake = new FakeClient(undefined, { status: 200, body: { allowed: "true" as unknown as boolean } });
  const route = withX402(handler, { config: CFG, client: fake as never });
  const res = await route(new Request("https://m.test/premium", { headers: { "X-Payment-Nonce": "n1" } }));
  assert.equal(res.status, 502);
});

test("explicit route override is used", async () => {
  const fake = new FakeClient({ status: 200, body: { paymentRequired: true } as ChallengeBody });
  const route = withX402(handler, { route: "/premium", config: CFG, client: fake as never });
  await route(new Request("https://m.test/mounted/thing"));
  assert.equal((fake.calls[0][1] as { route: string }).route, "/premium");
});

test("handler receives the original request + context", async () => {
  const fake = new FakeClient(undefined, { status: 200, body: { allowed: true } });
  const echo = async (req: Request, ctx?: unknown) =>
    Response.json({ path: new URL(req.url).pathname, ctx });
  const route = withX402(echo, { config: CFG, client: fake as never });
  const res = await route(new Request("https://m.test/premium", { headers: { "X-Payment-Nonce": "n1" } }), {
    params: { id: "7" },
  });
  assert.deepEqual(await res.json(), { path: "/premium", ctx: { params: { id: "7" } } });
});
