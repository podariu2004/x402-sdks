# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

require_relative "sign"

module X402
  # Relayed platform result. +status+ 0 == transport failure (no HTTP
  # response). +body+ is always a Hash (any non-object / invalid JSON is
  # coerced to {} so callers can index it safely).
  PlatformResponse = Struct.new(:status, :body)

  # Thin HTTP client for the platform's signed challenge/verify endpoints.
  # Net::HTTP only — no extra runtime dependencies. Any exception
  # (transport failure / timeout) ⇒ status 0 (fail-closed).
  class PlatformClient
    CHALLENGE_PATH = "/api/v1/challenge"
    VERIFY_PATH = "/api/v1/verify"
    REQUEST_TIMEOUT = 10 # seconds

    def initialize(config, transport: nil)
      @config = config
      # transport.(url, body, headers) -> [status, body_string]; defaults to
      # a real Net::HTTP POST. Tests inject a stub / raising lambda.
      @transport = transport || method(:net_http_post)
    end

    def challenge(route, method = nil)
      # Insertion-ordered Hash; Ruby preserves order, JSON.generate emits
      # compact JSON (no spaces) — the bytes signed == the bytes sent.
      payload = { "route" => route }
      payload["method"] = method if method && !method.to_s.empty?
      post(CHALLENGE_PATH, payload)
    end

    def verify(route:, method:, nonce:, payer: nil, payment_proof: nil)
      payload = { "route" => route }
      payload["method"] = method if method && !method.to_s.empty?
      payload["nonce"] = nonce
      payload["payer"] = payer if payer && !payer.to_s.empty?
      payload["payment_proof"] = payment_proof unless payment_proof.nil?
      post(VERIFY_PATH, payload)
    end

    private

    def post(path, payload)
      body = JSON.generate(payload)
      url = @config.base_url + path
      headers = { "Content-Type" => "application/json" }.merge(
        Sign.signed_headers(@config.key_id, @config.secret, "POST", path, body)
      )

      status, raw = @transport.call(url, body, headers)
      return PlatformResponse.new(0, {}) if status.nil? || status.to_i.zero?

      PlatformResponse.new(status.to_i, parse_object(raw))
    rescue StandardError
      # Transport failure / timeout / any error ⇒ fail-closed status 0.
      PlatformResponse.new(0, {})
    end

    def parse_object(raw)
      return {} if raw.nil? || raw.to_s.empty?

      parsed = JSON.parse(raw)
      parsed.is_a?(Hash) ? parsed : {}
    rescue JSON::ParserError
      {}
    end

    def net_http_post(url, body, headers)
      uri = URI.parse(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == "https")
      http.open_timeout = REQUEST_TIMEOUT
      http.read_timeout = REQUEST_TIMEOUT

      req = Net::HTTP::Post.new(uri.request_uri)
      headers.each { |k, v| req[k] = v }
      req.body = body

      resp = http.request(req)
      [resp.code.to_i, resp.body]
    end
  end
end
