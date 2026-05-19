package dev.x402.spring;

import java.util.function.Function;

/**
 * Resolved server-side configuration.
 *
 * <p>Kept identical in spirit to the other SDK references so all default to
 * the same platform.
 */
public final class X402Config {

    /**
     * Default platform base URL — identical across all x402 SDKs.
     * TODO: replace with the production platform domain before GA.
     */
    public static final String DEFAULT_BASE_URL = "https://api.x402.dev";

    public final String keyId;
    public final String secret;
    public final String baseUrl;
    /** "production" | "sandbox" */
    public final String env;

    public X402Config(String keyId, String secret, String baseUrl, String env) {
        this.keyId = keyId;
        this.secret = secret;
        this.baseUrl = baseUrl;
        this.env = env;
    }

    /**
     * Resolves config via the provided getter (pass {@code System::getenv} in
     * production; an injected function in tests).
     *
     * @throws IllegalStateException if X402_API_KEY or X402_SECRET is missing
     */
    public static X402Config resolve(Function<String, String> getenv) {
        Function<String, String> g = (getenv != null) ? getenv : System::getenv;

        String keyId = nullToEmpty(g.apply("X402_API_KEY"));
        String secret = nullToEmpty(g.apply("X402_SECRET"));
        if (keyId.isEmpty() || secret.isEmpty()) {
            throw new IllegalStateException(
                    "x402: X402_API_KEY and X402_SECRET must be set (server-side env)");
        }

        String mode = nullToEmpty(g.apply("X402_ENV")).toLowerCase(java.util.Locale.ROOT);
        if (mode.isEmpty()) {
            mode = "production";
        }

        String base = nullToEmpty(g.apply("X402_BASE_URL"));
        if (base.isEmpty()) {
            base = DEFAULT_BASE_URL;
        }
        base = stripTrailingSlash(base);

        String env = "sandbox".equals(mode) ? "sandbox" : "production";
        return new X402Config(keyId, secret, base, env);
    }

    private static String nullToEmpty(String s) {
        return (s == null) ? "" : s;
    }

    private static String stripTrailingSlash(String s) {
        int end = s.length();
        while (end > 0 && s.charAt(end - 1) == '/') {
            end--;
        }
        return s.substring(0, end);
    }
}
