package dev.x402.spring;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Thin transport to the x402 platform's signed challenge/verify endpoints.
 *
 * <p>Request bodies are built as COMPACT JSON BY HAND, field by field in the
 * exact contract order, so the bytes that are signed are byte-identical to the
 * bytes that are sent (no reflective serializer is involved). Any exception —
 * transport failure or timeout — is surfaced as {@code status == 0} so the
 * middleware fails closed.
 */
public final class PlatformClient {

    static final String CHALLENGE_PATH = "/api/v1/challenge";
    static final String VERIFY_PATH = "/api/v1/verify";
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);

    /** Result of a platform call. status 0 == transport failure / timeout. */
    public static final class Result {
        public final int status;
        public final String body;

        public Result(int status, String body) {
            this.status = status;
            this.body = (body == null) ? "" : body;
        }

        /** Best-effort boolean field lookup on a flat JSON object body. */
        public boolean jsonBoolean(String key) {
            return JsonLite.boolField(body, key);
        }
    }

    /** Seam so tests can inject a fake transport instead of real HTTP. */
    public interface Transport {
        /** @return status code, or 0 on any transport failure / timeout */
        Result send(String url, String body, Map<String, String> headers);
    }

    private final X402Config cfg;
    private final Transport transport;

    public PlatformClient(X402Config cfg, Transport transport) {
        this.cfg = cfg;
        this.transport = (transport != null) ? transport : new JdkTransport();
    }

    public PlatformClient(X402Config cfg) {
        this(cfg, null);
    }

    /** POST /api/v1/challenge — body {"route":...}(+"method"). */
    public Result challenge(String route, String method) {
        StringBuilder sb = new StringBuilder();
        sb.append('{').append(JsonLite.kv("route", route));
        if (method != null && !method.isEmpty()) {
            sb.append(',').append(JsonLite.kv("method", method));
        }
        sb.append('}');
        return post(CHALLENGE_PATH, sb.toString());
    }

    /** POST /api/v1/verify — body {"route","method","nonce","payer","payment_proof"}. */
    public Result verify(String route, String method, String nonce, String payer, String paymentProofJson) {
        StringBuilder sb = new StringBuilder();
        sb.append('{').append(JsonLite.kv("route", route));
        if (method != null && !method.isEmpty()) {
            sb.append(',').append(JsonLite.kv("method", method));
        }
        sb.append(',').append(JsonLite.kv("nonce", nonce));
        if (payer != null && !payer.isEmpty()) {
            sb.append(',').append(JsonLite.kv("payer", payer));
        }
        if (paymentProofJson != null && !paymentProofJson.isEmpty()) {
            // payment_proof is forwarded as a raw JSON value (the platform is
            // the single decision point); strings are quoted/escaped.
            sb.append(',').append(JsonLite.rawOrString("payment_proof", paymentProofJson));
        }
        sb.append('}');
        return post(VERIFY_PATH, sb.toString());
    }

    private Result post(String path, String body) {
        Map<String, String> headers = Sign.signedHeaders(cfg.keyId, cfg.secret, "POST", path, body);
        headers.put("Content-Type", "application/json");
        try {
            return transport.send(cfg.baseUrl + path, body, headers);
        } catch (RuntimeException e) {
            return new Result(0, "");
        }
    }

    /** Default {@link java.net.http.HttpClient} transport; exceptions ⇒ status 0. */
    static final class JdkTransport implements Transport {
        private final HttpClient http = HttpClient.newBuilder()
                .connectTimeout(REQUEST_TIMEOUT)
                .build();

        @Override
        public Result send(String url, String body, Map<String, String> headers) {
            try {
                HttpRequest.Builder b = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .timeout(REQUEST_TIMEOUT)
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
                for (Map.Entry<String, String> e : headers.entrySet()) {
                    b.header(e.getKey(), e.getValue());
                }
                HttpResponse<String> resp = http.send(b.build(),
                        HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                return new Result(resp.statusCode(), resp.body());
            } catch (Exception e) {
                // Transport failure / timeout / interruption ⇒ fail closed.
                return new Result(0, "");
            }
        }
    }
}
