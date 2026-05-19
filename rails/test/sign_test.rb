# frozen_string_literal: true

require "minitest/autorun"
require "digest"
require "json"

require "x402/sign"

# Conformance gate: every SDK loads the single shared vectors file and MUST
# reproduce the frozen X402v1 Known-Answer Test byte-for-byte.
class SignTest < Minitest::Test
  # Resolve relative to the repo root the same way sdks/go/sign_test.go does:
  # two directories up from the SDK dir.
  VECTORS_PATH = File.expand_path(
    File.join(__dir__, "..", "..", "..", "docs", "api", "x402-conformance-vectors.json")
  )

  def vectors
    @vectors ||= JSON.parse(File.read(VECTORS_PATH))
  end

  def test_scheme_is_frozen
    assert_equal "X402v1", X402::Sign::SCHEME
  end

  def test_canonical_is_frozen_layout
    v = vectors["kat"]
    got = X402::Sign.canonical("post", "/api/v1/verify", 1_700_000_000, "nonce-1", '{"a":1}')
    want = "X402v1\nPOST\n/api/v1/verify\n1700000000\nnonce-1\n" +
           Digest::SHA256.hexdigest('{"a":1}')
    assert_equal want, got
    assert_equal v["canonical"], got
  end

  def test_kat_signature_matches_shared_vector
    v = vectors["kat"]
    got = X402::Sign.sign(
      v["secret"], v["method"], v["path"], v["timestamp"], v["nonce"], v["body"]
    )
    assert_match(/\A[0-9a-f]{64}\z/, got)
    assert_equal v["signature"], got
    # The frozen oracle constant — pinned literally.
    assert_equal "c325bfaf7e66735f1e6a977b4b3b3fa6c9ae98d010123b1f724bed5ce5959ab5", got
  end

  def test_body_hashes_match_shared_vectors
    vectors["body_hashes"].each do |bh|
      assert_equal bh["sha256"], Digest::SHA256.hexdigest(bh["body"]),
                   "body hash mismatch for #{bh['body'].inspect}"
    end
    assert_equal "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                 Digest::SHA256.hexdigest("")
    assert_equal "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
                 Digest::SHA256.hexdigest('{"a":1}')
  end

  def test_signed_headers_shape
    h = X402::Sign.signed_headers("x402_test_abc", "x402sk_test_x", "POST",
                                  "/api/v1/challenge", '{"route":"/p"}')
    assert_equal "x402_test_abc", h["X-X402-Key"]
    assert_match(/\A\d+\z/, h["X-X402-Timestamp"])
    assert h["X-X402-Nonce"].length >= 16
    assert_match(/\A[0-9a-f]{64}\z/, h["X-X402-Signature"])
  end

  def test_signed_headers_nonces_unique
    a = X402::Sign.signed_headers("k", "s", "POST", "/api/v1/challenge", "")
    b = X402::Sign.signed_headers("k", "s", "POST", "/api/v1/challenge", "")
    refute_equal a["X-X402-Nonce"], b["X-X402-Nonce"]
  end

  def test_unicode_body_hashed_raw_utf8
    body = '{"name":"こんにちは"}'
    got = X402::Sign.canonical("POST", "/api/v1/verify", 1_700_000_000, "n", body)
    assert got.end_with?("\n" + Digest::SHA256.hexdigest(body))
  end
end
