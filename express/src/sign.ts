import { createHash, createHmac, randomUUID } from "node:crypto";

/** Canonical-string scheme version. MUST match the platform's X402ApiKey::SCHEME. */
export const SCHEME = "X402v1";

/**
 * Frozen signing contract (replicated byte-for-byte across all SDKs):
 *   canonical = "X402v1" LF METHOD LF path LF timestamp LF nonce LF sha256hex(body)
 *   - LF = "\n" (0x0A), never CRLF
 *   - METHOD uppercased; path is the request path the server sees
 *     (includes the "/api" prefix; no query, no host)
 *   - timestamp = unix seconds, decimal integer
 *   - body hashed with SHA-256, lowercase hex
 *   signature = HMAC-SHA256(secret, canonical), lowercase hex (64 chars)
 */
export function canonical(
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  body: string,
): string {
  if (!Number.isInteger(timestamp)) {
    throw new RangeError(
      `x402: timestamp must be an integer (unix seconds); got ${timestamp}`,
    );
  }
  return (
    SCHEME +
    "\n" +
    method.toUpperCase() +
    "\n" +
    path +
    "\n" +
    timestamp +
    "\n" +
    nonce +
    "\n" +
    createHash("sha256").update(body, "utf8").digest("hex") // body hashed as UTF-8 bytes — matches PHP hash('sha256', $body) on a UTF-8 string
  );
}

export function sign(
  secret: string,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(canonical(method, path, timestamp, nonce, body))
    .digest("hex");
}

export interface SignedHeaders {
  "X-X402-Key": string;
  "X-X402-Timestamp": string;
  "X-X402-Nonce": string;
  "X-X402-Signature": string;
}

export function signedHeaders(
  keyId: string,
  secret: string,
  method: string,
  path: string,
  body: string,
): SignedHeaders {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  return {
    "X-X402-Key": keyId,
    "X-X402-Timestamp": String(timestamp),
    "X-X402-Nonce": nonce,
    "X-X402-Signature": sign(secret, method, path, timestamp, nonce, body),
  };
}
