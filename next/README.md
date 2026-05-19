# x402 Next.js SDK

Thin x402 payment gate for Next.js (App Router). Edge-runtime safe — Web Crypto / fetch only, no node:*. Relays to the platform's signed challenge/verify and fails closed: if the platform is unreachable the route returns 502 and never serves paid content.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

```bash
npm install @x402/next
```

_(Until published: see [Source](#source) below — clone this directory.)_ Node ≥ 18 for tooling; runs on the Edge or Node runtime.

## Usage

```ts
// app/premium/route.ts
import { withX402 } from "@x402/next";

export const GET = withX402(
  async () => Response.json({ data: "paid content" }),
  { price: "0.10" },
);
```

`price` is a telemetry hint; the authoritative price is the route you registered on the platform. The wrapped handler receives the original `(request, context)` — including App Router route `params`.

### Edge middleware style

```ts
// middleware.ts
import { NextResponse } from "next/server";
import { x402EdgeGuard } from "@x402/next";

export async function middleware(req: Request) {
  const blocked = await x402EdgeGuard(req, { price: "0.10" });
  return blocked ?? NextResponse.next();
}
export const config = { matcher: "/premium/:path*" };
```

## Configuration

Server-side env vars:

| Var | Required | Default |
|---|---|---|
| `X402_API_KEY` | yes | — |
| `X402_SECRET` | yes | — |
| `X402_ENV` | no | `production` (`sandbox` for test mode) |
| `X402_BASE_URL` | no | platform default |

## Notes

- **Edge-safe:** the signing module uses async Web Crypto, so it runs unchanged on the Edge runtime. No `node:*` imports.
- **Test mode:** issue a `x402_test_…` key and set `X402_ENV=sandbox`. Test-mode payments settle synthetically so you can exercise the full challenge → 402 → verify → allow loop before going live. See `src/e2e.test.ts`.
- **Conformance:** `src/sign.test.ts` pins the shared cross-SDK Known-Answer Test from `docs/api/x402-conformance-vectors.json` (signature `c325bf…59ab5`) and is byte-identical to the Node/Express reference oracle and the FastAPI SDK.

## Source

<https://github.com/podariu2004/x402-sdks/tree/main/next>

## Docs

- <https://payrelayer.com/sdks/next>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
