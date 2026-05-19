import pytest

from x402_fastapi.config import DEFAULT_BASE_URL, resolve_config


def test_resolves_from_env_map():
    cfg = resolve_config(
        {"X402_API_KEY": "x402_test_k", "X402_SECRET": "x402sk_test_s"}
    )
    assert cfg.key_id == "x402_test_k"
    assert cfg.secret == "x402sk_test_s"
    assert cfg.base_url == DEFAULT_BASE_URL
    assert cfg.env == "production"


def test_sandbox_env_and_trailing_slash_stripped():
    cfg = resolve_config(
        {
            "X402_API_KEY": "k",
            "X402_SECRET": "s",
            "X402_ENV": "SANDBOX",
            "X402_BASE_URL": "https://staging.example.com///",
        }
    )
    assert cfg.env == "sandbox"
    assert cfg.base_url == "https://staging.example.com"


@pytest.mark.parametrize(
    "env",
    [{}, {"X402_API_KEY": "k"}, {"X402_SECRET": "s"}],
)
def test_missing_credentials_raise(env):
    with pytest.raises(RuntimeError):
        resolve_config(env)
