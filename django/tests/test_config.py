import pytest

from x402_django.config import DEFAULT_BASE_URL, resolve_config


def test_requires_key_and_secret():
    with pytest.raises(RuntimeError):
        resolve_config({})
    with pytest.raises(RuntimeError):
        resolve_config({"X402_API_KEY": "k"})
    with pytest.raises(RuntimeError):
        resolve_config({"X402_SECRET": "s"})


def test_defaults():
    cfg = resolve_config({"X402_API_KEY": "k", "X402_SECRET": "s"})
    assert cfg.key_id == "k"
    assert cfg.secret == "s"
    assert cfg.base_url == DEFAULT_BASE_URL
    assert cfg.env == "production"


def test_sandbox_env_and_base_url_trailing_slash_stripped():
    cfg = resolve_config(
        {
            "X402_API_KEY": "k",
            "X402_SECRET": "s",
            "X402_ENV": "sandbox",
            "X402_BASE_URL": "https://example.test/",
        }
    )
    assert cfg.env == "sandbox"
    assert cfg.base_url == "https://example.test"


def test_unknown_env_falls_back_to_production():
    cfg = resolve_config(
        {"X402_API_KEY": "k", "X402_SECRET": "s", "X402_ENV": "weird"}
    )
    assert cfg.env == "production"
