# frozen_string_literal: true

require "digest"
require "openssl"
require "securerandom"

module X402
  # Sign implements the frozen X402v1 wire contract:
  #
  #   canonical = "X402v1" LF METHOD LF path LF timestamp LF nonce LF sha256hex(body)
  #   signature = HMAC-SHA256(secret, canonical), lowercase hex (64 chars)
  #
  # Identical bytes to the Go / Node / FastAPI / Laravel / Spring / .NET
  # reference oracles.
  module Sign
    # Canonical-string version. MUST match the platform's X402ApiKey::SCHEME.
    SCHEME = "X402v1"

    module_function

    # Builds the frozen six-field canonical string. +timestamp+ is coerced to
    # an integer (unix seconds) so a non-integer is structurally impossible.
    def canonical(method, path, timestamp, nonce, body)
      [
        SCHEME,
        method.to_s.upcase,
        path,
        Integer(timestamp).to_s,
        nonce,
        Digest::SHA256.hexdigest(body.to_s)
      ].join("\n")
    end

    # Lowercase-hex HMAC-SHA256 of the canonical string (64 chars).
    def sign(secret, method, path, timestamp, nonce, body)
      OpenSSL::HMAC.hexdigest("SHA256", secret, canonical(method, path, timestamp, nonce, body))
    end

    # The four X-X402 headers with a fresh nonce and current unix seconds.
    def signed_headers(key_id, secret, method, path, body)
      ts = Time.now.to_i
      nonce = SecureRandom.uuid
      {
        "X-X402-Key" => key_id,
        "X-X402-Timestamp" => ts.to_s,
        "X-X402-Nonce" => nonce,
        "X-X402-Signature" => sign(secret, method, path, ts, nonce, body)
      }
    end
  end
end
