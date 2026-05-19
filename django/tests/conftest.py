"""Minimal, self-contained Django settings so the middleware tests run
without a project (no pytest-django dependency)."""

import django
from django.conf import settings

if not settings.configured:
    settings.configure(
        DEBUG=True,
        SECRET_KEY="x402-django-test-key",
        ALLOWED_HOSTS=["*"],
        DATABASES={},
        INSTALLED_APPS=[],
        MIDDLEWARE=[],
        # Gated route used across the middleware tests.
        X402_ROUTE="/premium",
        X402_PRICE="0.10",
    )
    django.setup()
