package dev.x402.spring;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code x402.route} / {@code x402.price} for the optional
 * auto-configuration. Platform credentials are read from the environment by
 * {@link X402Config} (X402_API_KEY / X402_SECRET / X402_ENV / X402_BASE_URL).
 */
@ConfigurationProperties(prefix = "x402")
public class X402Properties {

    /** The route URL pattern to gate (e.g. {@code /premium}). */
    private String route;

    /** Telemetry hint only; the authoritative price is the platform route. */
    private String price = "";

    public String getRoute() {
        return route;
    }

    public void setRoute(String route) {
        this.route = route;
    }

    public String getPrice() {
        return price;
    }

    public void setPrice(String price) {
        this.price = price;
    }
}
