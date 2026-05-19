# x402 Express SDK

Express middleware for pay-per-request access control using the x402 protocol. Drop one middleware in front of any route — agents pay in USDC, keys/fees/settlement live on the platform. Thin client: signs requests, interprets challenge/verify, fails closed.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

```sh
npm i @x402/express express
```

_(Until published: see [Source](#source) below — clone this directory.)_ `express` is not a dependency of this package (the middleware is duck-typed against minimal request/response shapes); install Express yourself. Requires Node.js **≥ 18**.

## Usage

```js
import express from "express";
import { x402 } from "@x402/express";

const app = express();
app.get("/premium", x402({ price: "0.10" }), (req, res) =>
  res.json({ data: "paid content" }));
```

The `price` option is informational (used for logging and telemetry). The authoritative price and currency are configured on the platform for the registered route.

## Configuration

Server-side env vars:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `X402_API_KEY` | yes | — | Public key identifier (e.g., `x402_live_…` / `x402_test_…`) |
| `X402_SECRET` | yes | — | Signing secret associated with the key |
| `X402_ENV` | no | `production` | Set to `sandbox` for test mode |
| `X402_BASE_URL` | no | `https://api.x402.dev` | Override the platform base URL (e.g., self-hosted or staging) |

Both `X402_API_KEY` and `X402_SECRET` are server-side secrets. Never expose them to browsers or commit them to version control.

## Notes

- **Fail-closed:** if the platform is unreachable or returns an unexpected response, the middleware responds with **HTTP 502** and never calls `next()`. Paid content is never served when the platform cannot authoritatively allow the request. An optional `onError` hook `(err, req, res)` is available for logging; the middleware still emits a 502 if the hook does not send a response.
- **Sandbox / test mode:** set `X402_ENV=sandbox` with a `x402_test_…` key. Payments are simulated by the platform and never submitted on-chain. Test keys are issued separately and cannot be used against the production platform.
- Full wire-contract details (signing scheme, header formats, schemas, error taxonomies) are in [`../../docs/api/x402-contract.md`](../../docs/api/x402-contract.md).

## Source

<https://github.com/podariu2004/paywall/tree/main/sdks/express>

## Docs

- <https://payrelayer.com/sdks/express>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
