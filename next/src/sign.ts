/**
 * X402v1 signing — Edge-runtime safe (Web Crypto, no node:crypto).
 * Byte-for-byte equivalent to sdks/express/src/sign.ts and the frozen
 * contract (docs/api/x402-contract.md):
 *
 *   canonical = "X402v1" LF METHOD LF path LF timestamp LF nonce LF sha256hex(body)
 *   signature = HMAC-SHA256(secret, canonical), lowercase hex (64 chars)
 *
 * Web Crypto is async, so canonical/sign/signedHeaders are async; the
 * produced bytes are identical to the sync Node reference.
 */

/** Canonical-string scheme version. MUST match the platform's X402ApiKey::SCHEME. */
export const SCHEME = "X402v1";

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}

export async function canonical(
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  body: string,
): Promise<string> {
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
    (await sha256Hex(body)) // body hashed as UTF-8 bytes — matches PHP/Node/Python
  );
}

export async function sign(
  secret: string,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(await canonical(method, path, timestamp, nonce, body)),
  );
  return toHex(sig);
}

export interface SignedHeaders {
  "X-X402-Key": string;
  "X-X402-Timestamp": string;
  "X-X402-Nonce": string;
  "X-X402-Signature": string;
}

export async function signedHeaders(
  keyId: string,
  secret: string,
  method: string,
  path: string,
  body: string,
): Promise<SignedHeaders> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  return {
    "X-X402-Key": keyId,
    "X-X402-Timestamp": String(timestamp),
    "X-X402-Nonce": nonce,
    "X-X402-Signature": await sign(secret, method, path, timestamp, nonce, body),
  };
}
