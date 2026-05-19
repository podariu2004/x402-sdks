# x402 Django SDK

Thin x402 payment-gate middleware for Django. Implements the frozen X402v1 wire contract. No payment logic in your app — it relays to the platform's signed challenge/verify and fails closed: if the platform is unreachable the route returns 502 and never serves paid content.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

```sh
pip install x402-django
```

_(Until published to PyPI: see [Source](#source) below — clone this directory and `pip install -e sdks/django`.)_ Requires Python **≥ 3.10**. Zero extra runtime dependencies — Python's stdlib (`hashlib`, `hmac`, `urllib`, `json`) only; Django itself is a peer dependency you already have.

## Usage

```python
# settings.py
MIDDLEWARE = [
    # ...
    "x402_django.X402Middleware",
]

X402_ROUTE = "/premium"
X402_PRICE = "0.10"
```

Add `"x402_django.X402Middleware"` to your `MIDDLEWARE` list and set `X402_ROUTE` (the gated path) and `X402_PRICE` in Django settings. Only that route is gated; every other request passes straight through.

`X402_PRICE` is a telemetry hint; the authoritative price is the route you registered on the platform.

## Configuration

Server-side env vars:

| Var | Required | Default |
|---|---|---|
| `X402_API_KEY` | yes | — |
| `X402_SECRET` | yes | — |
| `X402_ENV` | no | `production` (`sandbox` for test mode) |
| `X402_BASE_URL` | no | platform default |

## Notes

- **Fail-closed:** no payment proof → the platform's `/challenge` is relayed as HTTP `402`; an unknown route → `404 {"error":"no_such_route"}`; any other platform status or a transport failure/timeout → HTTP `502 {"error":"x402_platform_unavailable"}` and the protected view never runs. With proof → `/verify`; only an explicit `{"allowed":true}` lets the request through.
- **Standalone:** a plain Django middleware class — only the configured route is gated, everything else is untouched. Separate package from the FastAPI SDK; same frozen X402v1 contract, byte-identical signing.
- **Conformance:** `tests/test_sign.py` pins the shared cross-SDK Known-Answer Test from `docs/api/x402-conformance-vectors.json` and reproduces signature `c325bf…5959ab5` byte-for-byte — identical to the Go / Node / FastAPI / Laravel / Spring / .NET / Rails reference oracles.

## Source

<https://github.com/podariu2004/x402-sdks/tree/main/django>

## Docs

- <https://payrelayer.com/sdks/django>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
