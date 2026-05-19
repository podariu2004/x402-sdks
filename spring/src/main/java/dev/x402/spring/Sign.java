package dev.x402.spring;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Frozen X402v1 signing primitives.
 *
 * <pre>
 * canonical = "X402v1" LF METHOD LF path LF timestamp LF nonce LF sha256hex(body)
 * signature = HMAC-SHA256(secret, canonical) → lowercase hex (64 chars)
 * </pre>
 *
 * Byte-identical to the Go / Node / Python / PHP reference oracles. The
 * cross-SDK Known-Answer Test in {@code SignTest} is the conformance gate.
 */
public final class Sign {

    /** Canonical-string version. MUST match the platform's X402ApiKey::SCHEME. */
    public static final String SCHEME = "X402v1";

    private Sign() {
    }

    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private static String hex(byte[] bytes) {
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xff;
            out[i * 2] = HEX[v >>> 4];
            out[i * 2 + 1] = HEX[v & 0x0f];
        }
        return new String(out);
    }

    /** Lowercase-hex SHA-256 of the exact UTF-8 body bytes. */
    public static String sha256Hex(String body) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return hex(md.digest(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            // SHA-256 is mandated by the JCA spec — never absent.
            throw new IllegalStateException("x402: SHA-256 unavailable", e);
        }
    }

    /**
     * Builds the frozen six-field canonical string. {@code timestamp} is a
     * {@code long} (unix seconds): the type makes a non-integer impossible at
     * the call site, satisfying the contract's integer rule structurally.
     */
    public static String canonical(String method, String path, long timestamp, String nonce, String body) {
        return SCHEME + "\n"
                + method.toUpperCase(java.util.Locale.ROOT) + "\n"
                + path + "\n"
                + Long.toString(timestamp) + "\n"
                + nonce + "\n"
                + sha256Hex(body);
    }

    /** Lowercase-hex HMAC-SHA256 of the canonical string. */
    public static String sign(String secret, String method, String path, long timestamp, String nonce, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] sig = mac.doFinal(canonical(method, path, timestamp, nonce, body)
                    .getBytes(StandardCharsets.UTF_8));
            return hex(sig);
        } catch (Exception e) {
            throw new IllegalStateException("x402: HMAC-SHA256 unavailable", e);
        }
    }

    /** The four X-X402 signed headers with a fresh nonce and current time. */
    public static Map<String, String> signedHeaders(String keyId, String secret, String method,
            String path, String body) {
        long ts = System.currentTimeMillis() / 1000L;
        String nonce = UUID.randomUUID().toString();
        Map<String, String> h = new LinkedHashMap<>();
        h.put("X-X402-Key", keyId);
        h.put("X-X402-Timestamp", Long.toString(ts));
        h.put("X-X402-Nonce", nonce);
        h.put("X-X402-Signature", sign(secret, method, path, ts, nonce, body));
        return h;
    }
}
