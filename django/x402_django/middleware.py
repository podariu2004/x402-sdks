"""Django middleware that gates a route behind an x402 payment.

No business / settlement logic lives here: it relays to the platform's
signed challenge/verify and FAILS CLOSED — if the platform is unreachable
the route returns HTTP 502 and never serves paid content. The downstream
view runs ONLY when the platform explicitly allows the request.

Wire it up in Django settings:

    MIDDLEWARE = [
        # ...
        "x402_django.X402Middleware",
    ]
    X402_ROUTE = "/premium"
    X402_PRICE = "0.10"

Only the configured ``X402_ROUTE`` is gated; every other request passes
straight through. ``X402_PRICE`` is a telemetry hint only — the
authoritative price is the route you registered on the platform.
"""

from __future__ import annotations

import json
from typing import Any

from django.conf import settings
from django.http import JsonResponse

from .client import PlatformClient
from .config import resolve_config


class X402Middleware:
    def __init__(self, get_response) -> None:
        self.get_response = get_response
        self._route = getattr(settings, "X402_ROUTE", None)
        self._price = getattr(settings, "X402_PRICE", None)
        # Injectable for tests; otherwise built from env config.
        client = getattr(settings, "X402_CLIENT", None)
        self._client: PlatformClient = client or PlatformClient(resolve_config())

    def __call__(self, request):
        route = self._route
        # Only gate the configured route; pass everything else through.
        if not route or request.path != route:
            return self.get_response(request)

        method = request.method

        def fail_closed():
            return JsonResponse(
                {"error": "x402_platform_unavailable"}, status=502
            )

        proof_nonce = request.META.get("HTTP_X_PAYMENT_NONCE", "")
        if not proof_nonce:
            ch = self._client.challenge(route, method)
            if ch.status == 200:
                return JsonResponse(ch.body or {}, status=402)
            if ch.status == 404:
                return JsonResponse({"error": "no_such_route"}, status=404)
            return fail_closed()

        raw_proof = request.META.get("HTTP_X_PAYMENT", "")
        proof: Any = None
        if raw_proof:
            try:
                proof = json.loads(raw_proof)
            except Exception:
                # Forward raw; the platform is the single decision point.
                proof = raw_proof

        vr = self._client.verify(
            route=route,
            method=method,
            nonce=proof_nonce,
            payer=request.META.get("HTTP_X_PAYMENT_PAYER"),
            payment_proof=proof,
        )

        if vr.status == 200 and vr.body.get("allowed") is True:
            return self.get_response(request)
        if vr.status == 402:
            return JsonResponse(vr.body or {}, status=402)
        return fail_closed()
