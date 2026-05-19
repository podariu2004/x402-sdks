# frozen_string_literal: true

require "json"

require_relative "config"
require_relative "platform_client"

module X402
  # Rack middleware that gates a route behind an x402 payment. No business /
  # settlement logic lives here: it relays to the platform's signed
  # challenge/verify and FAILS CLOSED — if the platform is unreachable the
  # route returns HTTP 502 and never serves paid content. The downstream app
  # runs ONLY when the platform explicitly allows the request.
  #
  # Usable in Rails:
  #
  #   config.middleware.use X402::Middleware, route: "/premium", price: "0.10"
  #
  # or in any Rack app via `use X402::Middleware, route:, price:`.
  class Middleware
    # @param app   the downstream Rack app
    # @param route the gated route path; nil/empty ⇒ use the request path
    # @param price telemetry hint only; the authoritative price is the
    #              platform route
    # @param client injectable PlatformClient (tests / custom config)
    def initialize(app, route: nil, price: nil, client: nil, config: nil)
      @app = app
      @route = route
      @price = price
      @client = client || PlatformClient.new(config || Config.resolve)
    end

    def call(env)
      route_key = @route.to_s.empty? ? env["PATH_INFO"] : @route
      method = env["REQUEST_METHOD"]

      proof_nonce = env["HTTP_X_PAYMENT_NONCE"].to_s

      if proof_nonce.empty?
        ch = @client.challenge(route_key, method)
        case ch.status
        when 200
          return relay(402, ch.body)
        when 404
          return relay(404, { "error" => "no_such_route" })
        else
          return fail_closed
        end
      end

      raw_proof = env["HTTP_X_PAYMENT"]
      proof =
        if raw_proof.nil? || raw_proof.empty?
          nil
        else
          begin
            JSON.parse(raw_proof)
          rescue JSON::ParserError
            raw_proof # forward raw; the platform is the single decision point
          end
        end

      vr = @client.verify(
        route: route_key,
        method: method,
        nonce: proof_nonce,
        payer: env["HTTP_X_PAYMENT_PAYER"],
        payment_proof: proof
      )

      if vr.status == 200 && vr.body["allowed"] == true
        return @app.call(env)
      end
      return relay(402, vr.body) if vr.status == 402

      fail_closed
    end

    private

    def relay(status, body)
      payload = body.nil? || body.empty? ? {} : body
      json = JSON.generate(payload)
      [status, { "Content-Type" => "application/json" }, [json]]
    end

    def fail_closed
      relay(502, { "error" => "x402_platform_unavailable" })
    end
  end
end
