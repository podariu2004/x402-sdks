import type {
  ChallengeBody,
  ChallengeRequest,
  PlatformResponse,
  VerifyBody,
  VerifyRequest,
} from "./types.js";
import type { X402Config } from "./config.js";
import { signedHeaders } from "./sign.js";

type FetchFn = typeof fetch;

/** A stalled platform connection must fail closed, not hang the gate. */
const REQUEST_TIMEOUT_MS = 10_000;

// The platform signs over getPathInfo() == exactly these paths. It MUST be
// served at domain root; sub-path proxying changes getPathInfo() and breaks
// signatures.
const CHALLENGE_PATH = "/api/v1/challenge";
const VERIFY_PATH = "/api/v1/verify";

export class PlatformClient {
  constructor(
    private cfg: X402Config,
    private fetchFn: FetchFn = fetch,
  ) {}

  challenge(req: ChallengeRequest): Promise<PlatformResponse<ChallengeBody>> {
    return this.post<ChallengeBody>(CHALLENGE_PATH, req);
  }

  verify(req: VerifyRequest): Promise<PlatformResponse<VerifyBody>> {
    return this.post<VerifyBody>(VERIFY_PATH, req);
  }

  private async post<T>(
    path: string,
    payload: unknown,
  ): Promise<PlatformResponse<T>> {
    const body = JSON.stringify(payload);
    const headers = {
      "content-type": "application/json",
      ...(await signedHeaders(this.cfg.keyId, this.cfg.secret, "POST", path, body)),
    };
    try {
      const resp = await this.fetchFn(this.cfg.baseUrl + path, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      let parsed: unknown = {};
      try {
        parsed = await resp.json();
      } catch {
        parsed = {};
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
        parsed = {};
      return { status: resp.status, body: parsed as T };
    } catch {
      return { status: 0, body: {} as unknown as T };
    }
  }
}
