import type { NextLike, ReqLike, ResLike } from "./types.js";
import { resolveConfig, type X402Config } from "./config.js";
import { PlatformClient } from "./client.js";

export interface X402Options {
  /** Optional price hint for logging/telemetry; the authoritative price
   *  is the merchant's registered route on the platform. */
  price?: string;
  /**
   * Override the route key sent to the platform (defaults to req.path).
   * NOTE: on a sub-mounted Express router req.path is relative to the mount
   * point — set route explicitly if the platform-registered route differs
   * from req.path.
   */
  route?: string;
}

/**
 * @internal
 * Dependency-injection seam for tests; not part of the supported public API.
 * Production usage is x402({ price }).
 */
export interface X402Deps {
  config?: X402Config;
  client?: Pick<PlatformClient, "challenge" | "verify">;
  /**
   * Called on any fail-closed path with the error. It SHOULD terminate the
   * response; if it returns without sending, the middleware still emits a 502
   * (the request is never left hanging and paid content is never served).
   */
  onError?: (err: unknown, req: ReqLike, res: ResLike) => unknown;
}

// Node/Express lowercases header names; the second lookup only matters for non-Express ReqLike callers that don't normalize.
function header(req: ReqLike, name: string): string | undefined {
  const v = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Express middleware: gate a route behind an x402 payment.
 * No business/settlement logic lives here — it only relays to the
 * platform's signed challenge/verify endpoints and fails closed.
 * On any non-allow outcome the middleware responds directly (402/404/502)
 * and does NOT invoke Express's error pipeline or call next(err); next() is
 * called only when the platform explicitly authorises the request.
 */
export function x402(opts: X402Options = {}, deps: X402Deps = {}) {
  const cfg = deps.config ?? resolveConfig();
  const client = deps.client ?? new PlatformClient(cfg);

  return async function x402Middleware(
    req: ReqLike,
    res: ResLike,
    next: NextLike,
  ): Promise<void> {
    const route = opts.route ?? req.path ?? "/";
    const method = req.method;
    const proofNonce = header(req, "x-payment-nonce");

    // Fail closed (or delegate to onError) — never serve paid content
    // when the platform could not authoritatively allow the request.
    const failClosed = (err: unknown = new Error("x402_platform_unavailable")): void => {
      if (deps.onError) {
        deps.onError(err, req, res);
        if (!res.headersSent) {
          res.status(502).json({ error: "x402_platform_unavailable" });
        }
        return;
      }
      res.status(502).json({ error: "x402_platform_unavailable" });
    };

    try {
      if (!proofNonce) {
        const ch = await client.challenge({ route, method });
        if (ch.status === 200) {
          res.status(402).json(ch.body);
          return;
        }
        if (ch.status === 404) {
          res.status(404).json(ch.body);
          return;
        }
        failClosed();
        return;
      }

      let proof: unknown;
      const raw = header(req, "x-payment");
      if (raw) {
        try {
          proof = JSON.parse(raw);
        } catch {
          proof = raw;
        }
      }

      const vr = await client.verify({
        route,
        method,
        nonce: proofNonce,
        payer: header(req, "x-payment-payer"),
        payment_proof: proof,
      });

      if (vr.status === 200 && vr.body.allowed === true) {
        next();
        return;
      }
      if (vr.status === 402) {
        res.status(402).json(vr.body);
        return;
      }
      failClosed();
    } catch (err) {
      failClosed(err);
    }
  };
}
