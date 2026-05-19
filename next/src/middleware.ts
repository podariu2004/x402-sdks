import type { ChallengeBody, VerifyBody, PlatformResponse } from "./types.js";
import { resolveConfig, type X402Config } from "./config.js";
import { PlatformClient } from "./client.js";

export interface X402Options {
  /** Telemetry hint only; the authoritative price is the merchant's
   *  registered route on the platform. */
  price?: string;
  /** Override the route key sent to the platform. Default: the request
   *  URL pathname. Set explicitly if the platform-registered route
   *  differs from the deployed path. */
  route?: string;
  /** @internal DI seam for tests. */
  config?: X402Config;
  /** @internal DI seam for tests. */
  client?: Pick<PlatformClient, "challenge" | "verify">;
  /** Optional telemetry on any fail-closed path. MUST NOT be relied on
   *  to produce a response — the gate always emits 502 itself. */
  onError?: (err: unknown) => unknown;
}

/** App Router route-handler signature: (req, ctx?) => Response | Promise<Response>. */
export type RouteHandler = (
  req: Request,
  ctx?: unknown,
) => Response | Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Core gate. Returns a Response to short-circuit (402/404/502) or null to
 * allow the wrapped handler to run. No business/settlement logic — relays
 * to the platform's signed challenge/verify and fails closed.
 */
async function gate(
  client: Pick<PlatformClient, "challenge" | "verify">,
  route: string,
  method: string,
  req: Request,
  onError?: (err: unknown) => unknown,
): Promise<Response | null> {
  const failClosed = (err?: unknown): Response => {
    if (onError) {
      try {
        onError(err);
      } catch {
        /* telemetry must never override fail-closed */
      }
    }
    return jsonResponse(502, { error: "x402_platform_unavailable" });
  };

  try {
    const proofNonce = req.headers.get("x-payment-nonce");
    if (!proofNonce) {
      const ch: PlatformResponse<ChallengeBody> = await client.challenge({ route, method });
      if (ch.status === 200) return jsonResponse(402, ch.body);
      if (ch.status === 404) return jsonResponse(404, ch.body);
      return failClosed();
    }

    let proof: unknown;
    const raw = req.headers.get("x-payment");
    if (raw) {
      try {
        proof = JSON.parse(raw);
      } catch {
        proof = raw; // forward raw; platform is the single decision point
      }
    }

    const vreq: {
      route: string;
      method: string;
      nonce: string;
      payer?: string;
      payment_proof?: unknown;
    } = { route, method, nonce: proofNonce };
    const payer = req.headers.get("x-payment-payer");
    if (payer !== null) vreq.payer = payer;
    if (proof !== undefined) vreq.payment_proof = proof;

    const vr: PlatformResponse<VerifyBody> = await client.verify(vreq);
    if (vr.status === 200 && vr.body.allowed === true) return null; // allow
    if (vr.status === 402) return jsonResponse(402, vr.body);
    return failClosed();
  } catch (err) {
    return failClosed(err);
  }
}

/**
 * Wrap an App Router route handler behind an x402 payment gate.
 *
 *   export const GET = withX402(async () =>
 *     Response.json({ data: "paid content" }), { price: "0.10" });
 */
export function withX402(handler: RouteHandler, opts: X402Options = {}): RouteHandler {
  const client =
    opts.client ?? new PlatformClient(opts.config ?? resolveConfig());

  return async function x402Route(req: Request, ctx?: unknown): Promise<Response> {
    const route = opts.route ?? new URL(req.url).pathname;
    const denied = await gate(client, route, req.method, req, opts.onError);
    if (denied !== null) return denied;
    return handler(req, ctx);
  };
}

/**
 * Edge-middleware helper: returns a Response to short-circuit (402/404/502)
 * or null to allow. Wire into `middleware.ts`:
 *
 *   const blocked = await x402EdgeGuard(req, { price: "0.10" });
 *   if (blocked) return blocked;
 *   return NextResponse.next();
 */
export async function x402EdgeGuard(
  req: Request,
  opts: X402Options = {},
): Promise<Response | null> {
  const client =
    opts.client ?? new PlatformClient(opts.config ?? resolveConfig());
  const route = opts.route ?? new URL(req.url).pathname;
  return gate(client, route, req.method, req, opts.onError);
}
