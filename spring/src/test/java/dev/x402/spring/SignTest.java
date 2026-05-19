package dev.x402.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.junit.jupiter.api.Test;

/**
 * Cross-SDK conformance gate. Loads the single shared vector file
 * {@code docs/api/x402-conformance-vectors.json} (resolved relative to the
 * repo root the same way {@code sdks/go/sign_test.go} does — two dirs up from
 * the SDK directory) and asserts the frozen X402v1 Known-Answer Test.
 */
class SignTest {

    /** Locate docs/api/x402-conformance-vectors.json relative to repo root. */
    private static String loadVectorsJson() throws IOException {
        // sdks/go/sign_test.go uses filepath.Join("..","..","docs",...).
        // The test runs from the SDK module dir (sdks/spring), so the same
        // two-dir hop reaches the repo root.
        Path p = Paths.get("..", "..", "docs", "api", "x402-conformance-vectors.json");
        if (!Files.exists(p)) {
            // Fallback for IDE runners with a different working dir.
            p = Paths.get("sdks", "spring", "..", "..", "docs", "api",
                    "x402-conformance-vectors.json");
        }
        return new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
    }

    /** Minimal string-field extractor for the flat KAT object. */
    private static String field(String json, String key) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")
                .matcher(json);
        if (!m.find()) {
            throw new IllegalStateException("vector field not found: " + key);
        }
        return unescape(m.group(1));
    }

    private static long longField(String json, String key) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\"" + key + "\"\\s*:\\s*(-?\\d+)")
                .matcher(json);
        if (!m.find()) {
            throw new IllegalStateException("vector field not found: " + key);
        }
        return Long.parseLong(m.group(1));
    }

    private static String unescape(String s) {
        return s.replace("\\n", "\n").replace("\\\"", "\"").replace("\\\\", "\\");
    }

    @Test
    void schemeIsFrozen() {
        assertEquals("X402v1", Sign.SCHEME);
    }

    @Test
    void katSignatureMatchesSharedOracle() throws IOException {
        String json = loadVectorsJson();
        // The KAT block.
        int kIdx = json.indexOf("\"kat\"");
        String kat = json.substring(kIdx);

        String secret = field(kat, "secret");
        String method = field(kat, "method");
        String path = field(kat, "path");
        long ts = longField(kat, "timestamp");
        String nonce = field(kat, "nonce");
        String body = field(kat, "body");
        String expectedCanonical = field(kat, "canonical");
        String expectedSig = field(kat, "signature");
        String expectedBodySha = field(kat, "body_sha256");

        String canonical = Sign.canonical(method, path, ts, nonce, body);
        assertEquals(expectedCanonical, canonical, "canonical drift vs shared vector");
        assertEquals(expectedBodySha, Sign.sha256Hex(body), "body_sha256 drift");

        String sig = Sign.sign(secret, method, path, ts, nonce, body);
        assertTrue(sig.matches("^[0-9a-f]{64}$"), "signature not lowercase-hex-64: " + sig);
        assertEquals("c325bfaf7e66735f1e6a977b4b3b3fa6c9ae98d010123b1f724bed5ce5959ab5",
                expectedSig, "shared vector oracle changed unexpectedly");
        assertEquals(expectedSig, sig, "KAT signature mismatch");
    }

    @Test
    void bodyHashesMatchSharedOracle() throws IOException {
        String json = loadVectorsJson();
        // body_hashes: [ {"body":"","sha256":"e3b0..."}, {"body":"{\"a\":1}","sha256":"015a..."} ]
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                Sign.sha256Hex(""), "empty-body hash mismatch");
        assertEquals("015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
                Sign.sha256Hex("{\"a\":1}"), "{\"a\":1} body hash mismatch");

        // And assert they equal the values declared in the shared file.
        int bhIdx = json.indexOf("\"body_hashes\"");
        String bh = json.substring(bhIdx);
        assertTrue(bh.contains("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
        assertTrue(bh.contains("015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862"));
    }

    @Test
    void signedHeadersShape() {
        var h = Sign.signedHeaders("x402_test_abc", "x402sk_test_x", "POST",
                "/api/v1/challenge", "{\"route\":\"/p\"}");
        assertEquals("x402_test_abc", h.get("X-X402-Key"));
        assertTrue(h.get("X-X402-Timestamp").matches("^\\d+$"));
        assertTrue(h.get("X-X402-Nonce").length() >= 16);
        assertTrue(h.get("X-X402-Signature").matches("^[0-9a-f]{64}$"));
    }

    @Test
    void noncesUniqueAcrossCalls() {
        var a = Sign.signedHeaders("k", "s", "POST", "/api/v1/challenge", "");
        var b = Sign.signedHeaders("k", "s", "POST", "/api/v1/challenge", "");
        assertTrue(!a.get("X-X402-Nonce").equals(b.get("X-X402-Nonce")));
    }
}
