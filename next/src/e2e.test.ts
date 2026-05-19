import { test } from "node:test";
import assert from "node:assert/strict";
import { PlatformClient } from "./client.js";
import { withX402 } from "./middleware.js";
import type { X402Config } from "./config.js";

const CFG: X402Config = {
  keyId: "x402_test_k",
  secret: "x402sk_test_s",
  baseUrl: "https://plat.test",
  env: "sandbox",
};

// Mock the platform: challenge issues a nonce; verify allows iff that nonce
// is presented. Exercises sign + client + withX402 together, no network.
const platformFetch = (async (url: string, init: RequestInit) => {
  const u = new URL(url);
  if (u.pathname === "/api/v1/challenge") {
    return new Response(
      JSON.stringify({
        paymentRequired: true, amount: "0.10", currency: "USDC",
        network: "base", recipient: "0xPLAT", resource: "/premium",
        nonce: "chal-nonce-1", expiresAt: "2030-01-01T00:00:00+00:00",
      }),
      { status: 200 },
    );
  }
  if (u.pathname === "/api/v1/verify") {
    const sent = JSON.parse(init.body as string);
    const ok = sent.nonce === "chal-nonce-1";
    return new Response(
      JSON.stringify(ok ? { allowed: true } : { allowed: false, reason: "bad_nonce" }),
      { status: ok ? 200 : 402 },
    );
  }
  return new Response(JSON.stringify({ error: "no_such_route" }), { status: 404 });
}) as unknown as typeof fetch;

test("full test-mode flow: challenge → 402 → verify → allow", async () => {
  const client = new PlatformClient(CFG, platformFetch);
  const GET = withX402(async () => Response.json({ data: "paid content" }), {
    price: "0.10",
    config: CFG,
    client,
  });

  const first = await GET(new Request("https://m.test/premium"));
  assert.equal(first.status, 402);
  const challenge = (await first.json()) as { paymentRequired: boolean; nonce: string };
  assert.equal(challenge.paymentRequired, true);
  assert.equal(challenge.nonce, "chal-nonce-1");

  const paid = await GET(
    new Request("https://m.test/premium", { headers: { "X-Payment-Nonce": challenge.nonce } }),
  );
  assert.equal(paid.status, 200);
  assert.deepEqual(await paid.json(), { data: "paid content" });
});
