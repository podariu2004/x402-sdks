package dev.x402.spring;

import java.io.IOException;

import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Spring {@link OncePerRequestFilter} that gates a route behind an x402
 * payment. No business / settlement logic lives here: it relays to the
 * platform's signed challenge/verify and FAILS CLOSED — if the platform is
 * unreachable the route returns HTTP 502 and never serves paid content. The
 * downstream chain runs ONLY when the platform explicitly allows the request.
 *
 * <p>Usable directly:
 * <pre>{@code
 * FilterRegistrationBean<X402Filter> reg = new FilterRegistrationBean<>(
 *         new X402Filter("/premium", "0.10"));
 * reg.addUrlPatterns("/premium");
 * }</pre>
 */
public class X402Filter extends OncePerRequestFilter {

    /** The gated route path. Empty ⇒ use the incoming request path. */
    private final String route;
    /** Telemetry hint only; the authoritative price is the platform route. */
    private final String price;
    private final PlatformClient client;

    /** Resolves config from the environment and builds a real HTTP client. */
    public X402Filter(String route, String price) {
        this(route, price, new PlatformClient(X402Config.resolve(null)));
    }

    /** Injectable client (tests / custom config). */
    public X402Filter(String route, String price, PlatformClient client) {
        this.route = (route == null) ? "" : route;
        this.price = price;
        this.client = client;
    }

    public String getPrice() {
        return price;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp,
            FilterChain chain) throws ServletException, IOException {

        String routeKey = route.isEmpty() ? req.getRequestURI() : route;
        String method = req.getMethod();

        String proofNonce = req.getHeader("X-Payment-Nonce");

        if (proofNonce == null || proofNonce.isEmpty()) {
            PlatformClient.Result ch = client.challenge(routeKey, method);
            switch (ch.status) {
                case 200:
                    relay(resp, 402, ch.body);
                    return;
                case 404:
                    relay(resp, 404, "{\"error\":\"no_such_route\"}");
                    return;
                default:
                    failClosed(resp);
                    return;
            }
        }

        String proof = req.getHeader("X-Payment");
        String payer = req.getHeader("X-Payment-Payer");

        PlatformClient.Result vr = client.verify(routeKey, method, proofNonce, payer, proof);

        if (vr.status == 200 && vr.jsonBoolean("allowed")) {
            chain.doFilter(req, resp);
            return;
        }
        if (vr.status == 402) {
            relay(resp, 402, vr.body);
            return;
        }
        failClosed(resp);
    }

    private static void relay(HttpServletResponse resp, int status, String body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json");
        byte[] out = ((body == null || body.isEmpty()) ? "{}" : body)
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        resp.getOutputStream().write(out);
    }

    private static void failClosed(HttpServletResponse resp) throws IOException {
        relay(resp, 502, "{\"error\":\"x402_platform_unavailable\"}");
    }
}
