# frozen_string_literal: true

module X402
  # Config is the resolved server-side configuration, read from the
  # environment. Mirrors the other SDK references so every SDK defaults to
  # the same platform.
  class Config
    # Kept identical to the other SDK references so all default to the same
    # platform.
    DEFAULT_BASE_URL = "https://api.x402.dev"

    attr_reader :key_id, :secret, :base_url, :env

    def initialize(key_id:, secret:, base_url:, env:)
      @key_id = key_id
      @secret = secret
      @base_url = base_url
      @env = env
    end

    # Resolves config via the given getter (defaults to ENV; tests inject a
    # Hash-like). Raises if X402_API_KEY or X402_SECRET is missing.
    def self.resolve(getenv = nil)
      get =
        if getenv.nil?
          ->(k) { ENV[k] }
        elsif getenv.respond_to?(:call)
          getenv
        else
          # Hash-like (tests inject a Hash).
          ->(k) { getenv[k] }
        end

      key_id = get.call("X402_API_KEY").to_s
      secret = get.call("X402_SECRET").to_s
      if key_id.empty? || secret.empty?
        raise ArgumentError,
              "x402: X402_API_KEY and X402_SECRET must be set (server-side env)"
      end

      mode = get.call("X402_ENV").to_s.downcase
      mode = "production" if mode.empty?

      base = get.call("X402_BASE_URL").to_s
      base = DEFAULT_BASE_URL if base.empty?

      new(
        key_id: key_id,
        secret: secret,
        base_url: base.sub(%r{/+\z}, ""),
        env: mode == "sandbox" ? "sandbox" : "production"
      )
    end
  end
end
