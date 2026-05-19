# frozen_string_literal: true

require_relative "lib/x402/version"

Gem::Specification.new do |spec|
  spec.name          = "x402"
  spec.version       = X402::VERSION
  spec.authors       = ["Paywall"]
  spec.summary       = "Thin, fail-closed Rack/Rails middleware for the x402 paywall platform (frozen X402v1 wire contract)."
  spec.description    = "Add pay-per-request to any Rails or Rack route with one middleware. " \
                        "Implements the frozen X402v1 wire contract; relays to the platform's " \
                        "signed challenge/verify and fails closed (502, never serves paid " \
                        "content if the platform is unreachable)."
  spec.homepage      = "https://payrelayer.com/sdks/rails"
  spec.license       = "MIT"
  spec.required_ruby_version = ">= 2.6"

  spec.metadata = {
    "source_code_uri" => "https://github.com/podariu2004/paywall/tree/main/sdks/rails",
    "documentation_uri" => "https://payrelayer.com/sdks/rails"
  }

  spec.files = Dir["lib/**/*.rb"] + ["LICENSE", "README.md"]
  spec.require_paths = ["lib"]
end
