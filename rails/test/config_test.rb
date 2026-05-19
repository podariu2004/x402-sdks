# frozen_string_literal: true

require "minitest/autorun"

require "x402/config"

class ConfigTest < Minitest::Test
  def env(overrides = {})
    base = {
      "X402_API_KEY" => "key-abc",
      "X402_SECRET" => "sk-xyz"
    }
    base.merge(overrides)
  end

  def test_resolves_with_defaults
    cfg = X402::Config.resolve(env)
    assert_equal "key-abc", cfg.key_id
    assert_equal "sk-xyz", cfg.secret
    assert_equal "https://api.x402.dev", cfg.base_url
    assert_equal "production", cfg.env
  end

  def test_missing_key_raises
    assert_raises(ArgumentError) do
      X402::Config.resolve(env("X402_API_KEY" => ""))
    end
  end

  def test_missing_secret_raises
    assert_raises(ArgumentError) do
      X402::Config.resolve(env("X402_SECRET" => nil))
    end
  end

  def test_sandbox_env
    cfg = X402::Config.resolve(env("X402_ENV" => "sandbox"))
    assert_equal "sandbox", cfg.env
  end

  def test_unknown_env_is_production
    cfg = X402::Config.resolve(env("X402_ENV" => "weird"))
    assert_equal "production", cfg.env
  end

  def test_base_url_trailing_slash_stripped
    cfg = X402::Config.resolve(env("X402_BASE_URL" => "https://x.example.com/"))
    assert_equal "https://x.example.com", cfg.base_url
  end

  def test_accepts_callable_getenv
    getter = ->(k) { { "X402_API_KEY" => "k", "X402_SECRET" => "s" }[k] }
    cfg = X402::Config.resolve(getter)
    assert_equal "k", cfg.key_id
  end
end
