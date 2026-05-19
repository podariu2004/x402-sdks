# x402 Go SDK

Thin stdlib-only net/http x402 payment gate for Go. Implements the frozen X402v1 wire contract. Zero external dependencies. Relays to the platform's signed challenge/verify and fails closed: if the platform is unreachable the route returns 502 and never serves paid content.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

```bash
go get github.com/x402dev/x402-go
```

_(Until published: see [Source](#source) below — clone this directory.)_ Requires Go **≥ 1.21** (stdlib `net/http` only, zero external dependencies).

## Usage

```go
package main

import (
	"net/http"

	x402 "github.com/x402dev/x402-go"
)

func main() {
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":"paid content"}`))
	})

	mux := http.NewServeMux()
	mux.Handle("/premium", x402.Middleware(x402.Opts{Price: "0.10"})(h))
	http.ListenAndServe(":8080", mux)
}
```

`Price` is a telemetry hint; the authoritative price is the route you registered on the platform.

## Configuration

Server-side env vars:

| Var | Required | Default |
|---|---|---|
| `X402_API_KEY` | yes | — |
| `X402_SECRET` | yes | — |
| `X402_ENV` | no | `production` (`sandbox` for test mode) |
| `X402_BASE_URL` | no | platform default |

## Notes

- **Test mode:** issue a `x402_test_…` key and set `X402_ENV=sandbox`. Test-mode payments settle synthetically so you can exercise the full challenge → 402 → verify → allow loop before going live. See `e2e_test.go`.
- **Conformance:** `sign_test.go` pins the shared cross-SDK Known-Answer Test from `docs/api/x402-conformance-vectors.json` (signature `c325bf…59ab5`) and is byte-identical to the Node/Express reference oracle and the FastAPI / Next / Laravel SDKs.

## Source

<https://github.com/podariu2004/paywall/tree/main/sdks/go>

## Docs

- <https://payrelayer.com/sdks/go>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
