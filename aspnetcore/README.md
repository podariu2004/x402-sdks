# x402 ASP.NET Core SDK

Thin x402 payment-gate middleware for ASP.NET Core. Implements the frozen X402v1 wire contract. No payment logic in your app — it relays to the platform's signed challenge/verify and fails closed: if the platform is unreachable the route returns 502 and never serves paid content.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

```sh
dotnet add package X402.AspNetCore
```

_(Until published to NuGet: see [Source](#source) below — clone this directory and reference `X402.AspNetCore.csproj` directly.)_ Requires **.NET 8**. Zero extra runtime dependencies — `System.Security.Cryptography` and `System.Net.Http` only.

## Usage

```csharp
using X402.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseX402("/premium", "0.10");

app.MapGet("/premium", () => "paid content");

app.Run();
```

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

- **Fail-closed:** no payment proof → the platform's `/challenge` is relayed as HTTP `402`; an unknown route → `404 {"error":"no_such_route"}`; any other platform status or a transport failure/timeout → HTTP `502 {"error":"x402_platform_unavailable"}` and the protected handler never runs. With proof → `/verify`; only an explicit `{"allowed":true}` lets the request through.
- **Standalone:** it's standard ASP.NET Core middleware — works with Minimal APIs or MVC, anywhere in the request pipeline.
- **Conformance:** `SignTests` pins the shared cross-SDK Known-Answer Test from `docs/api/x402-conformance-vectors.json` and reproduces signature `c325bf…5959ab5` byte-for-byte — identical to the Go / Node / FastAPI / Laravel / Spring reference oracles.

## Source

<https://github.com/podariu2004/x402-sdks/tree/main/aspnetcore>

## Docs

- <https://payrelayer.com/sdks/aspnetcore>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
