import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "./config.js";

test("throws when key or secret missing", () => {
  assert.throws(() => resolveConfig({}), /X402_API_KEY/);
  assert.throws(() => resolveConfig({ X402_API_KEY: "k" }), /X402_SECRET/);
});

test("defaults baseUrl and trims trailing slashes", () => {
  const a = resolveConfig({ X402_API_KEY: "k", X402_SECRET: "s" });
  assert.equal(a.baseUrl, "https://api.x402.dev");
  const b = resolveConfig({ X402_API_KEY: "k", X402_SECRET: "s", X402_BASE_URL: "https://h.example///" });
  assert.equal(b.baseUrl, "https://h.example");
});

test("env maps to sandbox only for X402_ENV=sandbox (case-insensitive), else production", () => {
  assert.equal(resolveConfig({ X402_API_KEY: "k", X402_SECRET: "s" }).env, "production");
  assert.equal(resolveConfig({ X402_API_KEY: "k", X402_SECRET: "s", X402_ENV: "SANDBOX" }).env, "sandbox");
  assert.equal(resolveConfig({ X402_API_KEY: "k", X402_SECRET: "s", X402_ENV: "prod" }).env, "production");
});
