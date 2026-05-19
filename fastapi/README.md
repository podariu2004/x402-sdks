# x402 FastAPI SDK

Thin FastAPI client for the x402 paywall platform. Implements the frozen X402v1 wire contract. No settlement logic — relays to the platform's signed challenge/verify and fails closed: if the platform is unreachable the gated route returns 502 and never serves paid content.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

```bash
pip install x402-fastapi
```

_(Until published: see [Source](#source) below — clone this directory.)_ Requires Python **≥ 3.10**.

## Usage

```python
from fastapi import FastAPI
from x402_fastapi import x402_paywall

app = FastAPI()

@app.get("/premium")
@x402_paywall(price="0.10")
async def premium():
    return {"data": "paid content"}
```

`price` is a telemetry hint; the authoritative price is the route you registered on the platform.

### Dependency style

```python
from fastapi import Depends, FastAPI
from x402_fastapi import x402_guard, install_x402

app = FastAPI()
install_x402(app)  # once, renders denials with the platform body

@app.get("/premium", dependencies=[Depends(x402_guard(price="0.10"))])
async def premium():
    return {"data": "paid content"}
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

- **Test mode:** issue a `x402_test_…` key on the platform and set `X402_ENV=sandbox`. Test-mode payments settle synthetically (no on-chain call) so you can exercise the full challenge → 402 → verify → allow loop end-to-end before going live. See `tests/test_e2e.py` for the exact flow.
- **Conformance:** `tests/test_sign.py` pins the shared cross-SDK Known-Answer Test from `docs/api/x402-conformance-vectors.json` (signature `c325bf…59ab5`). This SDK is byte-identical to the Node/Express reference oracle (`sdks/express/src/sign.ts`).

## Source

<https://github.com/podariu2004/x402-sdks/tree/main/fastapi>

## Docs

- <https://payrelayer.com/sdks/fastapi>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
