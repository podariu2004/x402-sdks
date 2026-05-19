export interface X402Config {
  keyId: string;
  secret: string;
  baseUrl: string;
  env: "production" | "sandbox";
}

const DEFAULT_BASE_URL = "https://api.x402.dev"; // TODO: replace with the production platform domain before GA.

/** Resolve config from process.env (or an injected env map for tests). */
export function resolveConfig(
  env: Record<string, string | undefined> = process.env,
): X402Config {
  const keyId = env.X402_API_KEY;
  const secret = env.X402_SECRET;
  if (!keyId || !secret) {
    throw new Error(
      "x402: X402_API_KEY and X402_SECRET must be set (server-side env).",
    );
  }
  const mode = (env.X402_ENV ?? "production").toLowerCase();
  return {
    keyId,
    secret,
    baseUrl: (env.X402_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    env: mode === "sandbox" ? "sandbox" : "production",
  };
}
