# frozen_string_literal: true

# x402 — thin, fail-closed Rack/Rails client for the x402 paywall platform
# implementing the frozen X402v1 wire contract.
require_relative "x402/version"
require_relative "x402/sign"
require_relative "x402/config"
require_relative "x402/platform_client"
require_relative "x402/middleware"

module X402
end
