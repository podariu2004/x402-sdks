import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig, DEFAULT_BASE_URL } from "./config.js";

test("resolves from an injected env map", () => {
  const c = resolveConfig({ X402_API_KEY: "x402_test_k", X402_SECRET: "x402sk_test_s" });
  assert.equal(c.keyId, "x402_test_k");
  assert.equal(c.secret, "x402sk_test_s");
  assert.equal(c.baseUrl, DEFAULT_BASE_URL);
  assert.equal(c.env, "production");
});

test("sandbox env + trailing slash stripped", () => {
  const c = resolveConfig({
    X402_API_KEY: "k",
    X402_SECRET: "s",
    X402_ENV: "SANDBOX",
    X402_BASE_URL: "https://staging.example.com///",
  });
  assert.equal(c.env, "sandbox");
  assert.equal(c.baseUrl, "https://staging.example.com");
});

test("missing credentials throw", () => {
  assert.throws(() => resolveConfig({}), /X402_API_KEY and X402_SECRET/);
  assert.throws(() => resolveConfig({ X402_API_KEY: "k" }), /X402_API_KEY and X402_SECRET/);
  assert.throws(() => resolveConfig({ X402_SECRET: "s" }), /X402_API_KEY and X402_SECRET/);
});
