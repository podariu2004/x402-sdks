# x402 Rails SDK

Thin x402 payment-gate middleware for Ruby on Rails (and any Rack app). Implements the frozen X402v1 wire contract. No payment logic in your app — it relays to the platform's signed challenge/verify and fails closed: if the platform is unreachable the route returns 502 and never serves paid content.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

```sh
bundle add x402
```

_(Until published to RubyGems: see [Source](#source) below — clone this directory and point your `Gemfile` at it: `gem "x402", path: "sdks/rails"`.)_ Requires Ruby **2.6+**. Zero extra runtime dependencies — Ruby's stdlib (`openssl`, `digest`, `net/http`, `json`) only.

## Usage

```ruby
config.middleware.use X402::Middleware, route: "/premium", price: "0.10"
```

In Rails, add that line to `config/application.rb` (or an environment file). In any other Rack app, `use X402::Middleware, route: "/premium", price: "0.10"`.

`price` is a telemetry hint; the authoritative price is the route you registered on the platform.

## Configuration

Server-side env vars:

| Var | Required | Default |
|---|---|---|
| `X402_API_KEY` | yes | — |
| `X402_SECRET` | yes | — |
| `X402_ENV` | no | `production` (`sandbox` for test mode) |
| `X402_BASE_URL` | no | platform default |

## Notes

- **Fail-closed:** no payment proof → the platform's `/challenge` is relayed as HTTP `402`; an unknown route → `404 {"error":"no_such_route"}`; any other platform status or a transport failure/timeout → HTTP `502 {"error":"x402_platform_unavailable"}` and the protected app never runs. With proof → `/verify`; only an explicit `{"allowed":true}` lets the request through.
- **Standalone:** it's plain Rack middleware — works in any Rack-based Ruby app; Rails wiring is one line.
- **Conformance:** `sign_test.rb` pins the shared cross-SDK Known-Answer Test from `docs/api/x402-conformance-vectors.json` and reproduces signature `c325bf…5959ab5` byte-for-byte — identical to the Go / Node / FastAPI / Laravel / Spring / .NET reference oracles.

## Source

<https://github.com/podariu2004/paywall/tree/main/sdks/rails>

## Docs

- <https://payrelayer.com/sdks/rails>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
