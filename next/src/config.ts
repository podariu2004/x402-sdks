export interface X402Config {
  keyId: string;
  secret: string;
  baseUrl: string;
  env: "production" | "sandbox";
}

// TODO: replace with the production platform domain before GA (kept
// identical to the Express/FastAPI references so all SDKs default alike).
export const DEFAULT_BASE_URL = "https://api.x402.dev";

/** Resolve config from env (process.env or an injected map for tests). */
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
