# x402 SDKs

Official client SDKs for **x402** — the pay-per-call protocol that lets your API charge AI agents per request in USDC. Add one middleware; agents get a signed `402` price, pay, and the request is served.

Platform & docs: **https://payrelayer.com** · For developers: **https://payrelayer.com/for-developers** · Per-SDK pages: **https://payrelayer.com/sdks**

## The 9 SDKs

| Language / framework | Folder | Package (registry — coming) |
|---|---|---|
| Node / Express | [`express`](./express) | `@x402/express` |
| Next.js (Edge-safe) | [`next`](./next) | `@x402/next` |
| Python / FastAPI | [`fastapi`](./fastapi) | `x402-fastapi` |
| Python / Django | [`django`](./django) | `x402-django` |
| PHP / Laravel | [`laravel`](./laravel) | `x402/laravel` |
| Go (stdlib net/http) | [`go`](./go) | `github.com/x402dev/x402-go` |
| Java / Spring Boot | [`spring`](./spring) | `dev.x402:x402-spring` |
| C# / ASP.NET Core | [`aspnetcore`](./aspnetcore) | `X402.AspNetCore` |
| Ruby on Rails | [`rails`](./rails) | `x402` |

Each folder has its own README with the exact install command and a minimal usage snippet.

## One frozen contract

All 9 SDKs implement the same **frozen X402v1 wire contract** — byte-identical request signing across every language, enforced by a shared known-answer signature test. Pick the SDK for your stack; the on-the-wire behaviour is identical everywhere.

## Availability

Source is public here. **Official registry packages (npm · PyPI · Packagist · Go · Maven Central · NuGet · RubyGems) are coming** — until then, use the source in each folder. See each SDK's README for the exact steps.

## How it works (every SDK)

1. Register a route + price and get an API key (test or live) at [payrelayer.com](https://payrelayer.com/register?role=merchant).
2. Set `X402_API_KEY` and `X402_SECRET` (plus optional `X402_ENV=sandbox` and `X402_BASE_URL`).
3. Add the one middleware/filter for your framework (see the folder's README).

The SDK is a thin client: it relays to the platform's signed challenge/verify endpoints and **fails closed** — if the platform is unreachable the gated route returns `502` and never serves paid content. A sandbox mode lets you build and test the full loop without real funds.

## License

MIT — see [`LICENSE`](./LICENSE) (and the `LICENSE` in each SDK folder).
