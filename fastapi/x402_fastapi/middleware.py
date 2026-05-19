"""FastAPI integration — mirrors sdks/express/src/middleware.ts.

Primary API (spec headline ergonomic):

    @app.get("/premium")
    @x402_paywall(price="0.10")
    async def premium(): return {"data": "paid content"}

Also exposes `x402_guard` (a FastAPI dependency) + `install_x402` for the
dependency style. No business/settlement logic — relay to the platform's
signed challenge/verify and fail closed. On any non-allow outcome the
wrapper returns the response directly (402/404/502); the handler runs only
when the platform explicitly authorises the request.
"""

from __future__ import annotations

import functools
import inspect
import json
from typing import Any, Awaitable, Callable

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from .client import PlatformClient
from .config import X402Config, resolve_config


def _header(request: Request, name: str) -> str | None:
    # Starlette headers are already case-insensitive.
    return request.headers.get(name)


def _request_dep(request: Request) -> Request:
    """Sub-dependency yielding the live Request. FastAPI resolves this
    independently, so it never collides with (or steals) a handler's own
    `request: Request` parameter — unlike a synthetic top-level Request param,
    which FastAPI would dedupe down to a single request param per operation."""
    return request


async def _gate(
    client: Any,
    route: str,
    method: str,
    request: Request,
    on_error: Callable[[Exception | None], Any] | None,
) -> JSONResponse | None:
    """Return a JSONResponse to short-circuit, or None to allow the handler."""

    def fail_closed(err: Exception | None = None) -> JSONResponse:
        if on_error is not None:
            try:
                on_error(err)
            except Exception:
                pass  # telemetry must never override fail-closed
        return JSONResponse(status_code=502, content={"error": "x402_platform_unavailable"})

    try:
        proof_nonce = _header(request, "x-payment-nonce")
        if not proof_nonce:
            ch = await client.challenge({"route": route, "method": method})
            if ch.status == 200:
                return JSONResponse(status_code=402, content=ch.body)
            if ch.status == 404:
                return JSONResponse(status_code=404, content=ch.body)
            return fail_closed()

        raw = _header(request, "x-payment")
        proof: Any = None
        if raw:
            try:
                proof = json.loads(raw)
            except Exception:
                proof = raw  # forward raw; platform is the single decision point

        req: dict[str, Any] = {"route": route, "method": method, "nonce": proof_nonce}
        payer = _header(request, "x-payment-payer")
        if payer is not None:
            req["payer"] = payer
        if proof is not None:
            req["payment_proof"] = proof

        vr = await client.verify(req)
        if vr.status == 200 and vr.body.get("allowed") is True:
            return None  # allow
        if vr.status == 402:
            return JSONResponse(status_code=402, content=vr.body)
        return fail_closed()
    except Exception as err:  # never leak; never serve paid content
        return fail_closed(err)


def x402_paywall(
    price: str | None = None,
    route: str | None = None,
    *,
    config: X402Config | None = None,
    client: Any | None = None,
    on_error: Callable[[Exception | None], Any] | None = None,
):
    """Decorator gating a FastAPI path operation behind an x402 payment.

    `price` is an optional telemetry hint; the authoritative price is the
    merchant's registered route on the platform. `route` overrides the route
    key sent to the platform (default: the request path — set explicitly on a
    sub-mounted router whose path differs from the platform-registered route).
    """

    def decorator(func: Callable[..., Awaitable[Any] | Any]):
        cfg = config or (None if client is not None else resolve_config())
        plat = client if client is not None else PlatformClient(cfg)  # type: ignore[arg-type]
        is_async = inspect.iscoroutinefunction(func)

        @functools.wraps(func)
        async def wrapper(*args: Any, x402_request: Request, **kwargs: Any):
            route_key = route or x402_request.url.path
            denied = await _gate(
                plat, route_key, x402_request.method, x402_request, on_error
            )
            if denied is not None:
                return denied
            if is_async:
                return await func(*args, **kwargs)
            return func(*args, **kwargs)

        # Inject the Request WITHOUT colliding with a handler that declares its
        # own `request: Request`. FastAPI collapses every Request-annotated
        # parameter in a path operation down to ONE request param, so a
        # synthetic top-level `x402_request: Request` would steal/drop the
        # handler's own. Instead inject via a sub-dependency (`Depends`):
        # FastAPI resolves `_request_dep` independently and never dedupes it
        # against the handler's Request param. The extra param therefore has a
        # `Depends` default and a non-Request annotation.
        sig = inspect.signature(func)
        params = list(sig.parameters.values())
        extra = inspect.Parameter(
            "x402_request",
            inspect.Parameter.KEYWORD_ONLY,
            default=Depends(_request_dep),
            annotation=Any,
        )
        # A KEYWORD_ONLY param must precede any trailing **kwargs (VAR_KEYWORD).
        if params and params[-1].kind is inspect.Parameter.VAR_KEYWORD:
            params.insert(len(params) - 1, extra)
        else:
            params.append(extra)
        wrapper.__signature__ = sig.replace(parameters=params)  # type: ignore[attr-defined]
        return wrapper

    return decorator


class X402Denied(Exception):
    """Raised by the `x402_guard` dependency; rendered by `install_x402`."""

    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        self.status_code = status_code
        self.body = body


def install_x402(app: FastAPI) -> None:
    """Register the exception handler that renders `x402_guard` denials."""

    @app.exception_handler(X402Denied)
    async def _render(_: Request, exc: X402Denied) -> JSONResponse:  # noqa: ANN202
        return JSONResponse(status_code=exc.status_code, content=exc.body)


def x402_guard(
    price: str | None = None,
    route: str | None = None,
    *,
    config: X402Config | None = None,
    client: Any | None = None,
    on_error: Callable[[Exception | None], Any] | None = None,
):
    """FastAPI dependency form: `dependencies=[Depends(x402_guard(price="0.10"))]`.
    Requires `install_x402(app)` once at startup so denials render with the
    platform body (not FastAPI's default {"detail": ...})."""

    cfg = config or (None if client is not None else resolve_config())
    plat = client if client is not None else PlatformClient(cfg)  # type: ignore[arg-type]

    async def dependency(request: Request) -> None:
        route_key = route or request.url.path
        denied = await _gate(plat, route_key, request.method, request, on_error)
        if denied is not None:
            # denied is a JSONResponse — surface its status/body via the
            # installed handler so the contract body is preserved.
            raise X402Denied(denied.status_code, json.loads(bytes(denied.body)))

    return dependency
