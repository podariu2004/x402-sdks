# frozen_string_literal: true

require "minitest/autorun"
require "json"

require "x402/middleware"
require "x402/platform_client"

class MiddlewareTest < Minitest::Test
  CFG = X402::Config.new(
    key_id: "key", secret: "sk", base_url: "https://platform.test", env: "production"
  )

  DOWNSTREAM = ->(_env) { [200, { "Content-Type" => "text/plain" }, ["paid content"]] }

  # PlatformClient wired to a canned (status, body) transport.
  def client(status, body)
    X402::PlatformClient.new(CFG, transport: ->(_u, _b, _h) { [status, body] })
  end

  # PlatformClient whose transport raises — simulates a network exception.
  def throwing_client
    X402::PlatformClient.new(CFG, transport: ->(_u, _b, _h) { raise "connection refused" })
  end

  def call(mw, env_overrides = {})
    env = { "PATH_INFO" => "/premium", "REQUEST_METHOD" => "GET" }.merge(env_overrides)
    mw.call(env)
  end

  def downstream_ran?(status, body)
    status == 200 && body == ["paid content"]
  end

  # --- no proof → /challenge ---

  def test_no_proof_challenge_200_relayed_as_402
    mw = X402::Middleware.new(DOWNSTREAM, route: "/premium",
                              client: client(200, '{"challenge":"pay-me"}'))
    status, _h, body = call(mw)
    assert_equal 402, status
    assert_includes body.join, "pay-me"
  end

  def test_no_proof_challenge_404_relayed_as_404_hardcoded
    mw = X402::Middleware.new(DOWNSTREAM, route: "/premium", client: client(404, "{}"))
    status, _h, body = call(mw)
    assert_equal 404, status
    assert_equal({ "error" => "no_such_route" }, JSON.parse(body.join))
  end

  def test_no_proof_challenge_500_fails_closed_502
    mw = X402::Middleware.new(DOWNSTREAM, route: "/premium", client: client(500, "boom"))
    status, _h, body = call(mw)
    assert_equal 502, status
    assert_includes body.join, "x402_platform_unavailable"
  end

  def test_no_proof_transport_error_fails_closed_502
    mw = X402::Middleware.new(DOWNSTREAM, route: "/premium", client: throwing_client)
    status, _h, body = call(mw)
    assert_equal 502, status
    assert_includes body.join, "x402_platform_unavailable"
  end

  # --- with proof → /verify ---

  def test_with_proof_verify_allowed_passthrough
    mw = X402::Middleware.new(DOWNSTREAM, route: "/premium",
                              client: client(200, '{"allowed":true}'))
    status, _h, body = call(mw, "HTTP_X_PAYMENT_NONCE" => "n-1",
                                "HTTP_X_PAYMENT" => '{"tx":"abc"}')
    assert downstream_ran?(status, body), "downstream handler should run"
  end

  def test_with_proof_verify_not_allowed_fails_closed_502
    mw = X402::Middleware.new(DOWNSTREAM, route: "/premium",
                              client: client(200, '{"allowed":false}'))
    status, = call(mw, "HTTP_X_PAYMENT_NONCE" => "n-1")
    assert_equal 502, status # verify 200 + not allowed ⇒ fail-closed
  end

  def test_with_proof_verify_402_relayed_as_402
    mw = X402::Middleware.new(DOWNSTREAM, route: "/premium",
                              client: client(402, '{"error":"payment_required"}'))
    status, _h, body = call(mw, "HTTP_X_PAYMENT_NONCE" => "n-1")
    assert_equal 402, status
    assert_includes body.join, "payment_required"
  end

  def test_with_proof_transport_error_fails_closed_502
    mw = X402::Middleware.new(DOWNSTREAM, route: "/premium", client: throwing_client)
    status, = call(mw, "HTTP_X_PAYMENT_NONCE" => "n-1")
    assert_equal 502, status
  end

  # --- compact JSON: signed bytes == sent bytes ---

  def test_compact_json_body_signed_bytes_equal_sent_bytes
    seen = {}
    transport = lambda do |_url, body, headers|
      seen[:body] = body
      seen[:sig] = headers["X-X402-Signature"]
      [200, '{"allowed":true}']
    end
    pc = X402::PlatformClient.new(CFG, transport: transport)
    pc.challenge("/premium", "GET")

    assert_equal '{"route":"/premium","method":"GET"}', seen[:body]
    assert_match(/\A[0-9a-f]{64}\z/, seen[:sig])
  end
end
