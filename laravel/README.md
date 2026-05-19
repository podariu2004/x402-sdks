# x402 Laravel SDK

Thin x402 payment-gate middleware for Laravel apps. Implements the frozen X402v1 wire contract. A client SDK for your Laravel app — distinct from the platform backend. Relays to the platform's signed challenge/verify and fails closed: if the platform is unreachable the route returns 502 and never serves paid content.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

```bash
composer require x402/laravel
```

_(Until published: see [Source](#source) below — clone this directory.)_ PHP **≥ 8.1**, Laravel 10. The `X402ServiceProvider` is auto-discovered and registers the `x402` route-middleware alias.

## Usage

```php
Route::middleware('x402:0.10')->get('/premium', fn () =>
    response()->json(['data' => 'paid content']));
```

`0.10` is a telemetry hint; the authoritative price is the route you registered on the platform.

## Configuration

Server-side env vars:

| Var | Required | Default |
|---|---|---|
| `X402_API_KEY` | yes | — |
| `X402_SECRET` | yes | — |
| `X402_ENV` | no | `production` (`sandbox` for test mode) |
| `X402_BASE_URL` | no | platform default |

## Notes

- **Test mode:** issue a `x402_test_…` key and set `X402_ENV=sandbox`. Test-mode payments settle synthetically so you can exercise the full challenge → 402 → verify → allow loop before going live. See `tests/E2ETest.php`.
- **Conformance:** `tests/SignTest.php` pins the shared cross-SDK Known-Answer Test from `docs/api/x402-conformance-vectors.json` (signature `c325bf…59ab5`) and is byte-identical to the Node/Express reference oracle and the FastAPI / Next SDKs.

## Source

<https://github.com/podariu2004/paywall/tree/main/sdks/laravel>

## Docs

- <https://payrelayer.com/sdks/laravel>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
