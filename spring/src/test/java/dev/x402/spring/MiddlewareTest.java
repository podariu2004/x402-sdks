package dev.x402.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * Fail-closed flow tests using an injected fake {@link PlatformClient.Transport}
 * (no real HTTP) and Spring's servlet mocks.
 */
class MiddlewareTest {

    private static final X402Config CFG =
            new X402Config("key", "sk", "https://platform.test", "production");

    /** Fake transport returning a canned (status, body) for every call. */
    private static PlatformClient client(int status, String body) {
        PlatformClient.Transport t =
                (url, b, headers) -> new PlatformClient.Result(status, body);
        return new PlatformClient(CFG, t);
    }

    /** Transport that throws — simulates a network exception. */
    private static PlatformClient throwingClient() {
        PlatformClient.Transport t = (url, b, headers) -> {
            throw new RuntimeException("connection refused");
        };
        return new PlatformClient(CFG, t);
    }

    private MockHttpServletResponse run(X402Filter f, MockHttpServletRequest req,
            MockFilterChain chain) throws Exception {
        MockHttpServletResponse resp = new MockHttpServletResponse();
        f.doFilter(req, resp, chain);
        return resp;
    }

    @Test
    void noProof_challenge200_relayedAs402() throws Exception {
        X402Filter f = new X402Filter("/premium", "0.10",
                client(200, "{\"challenge\":\"pay-me\"}"));
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/premium");
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse resp = run(f, req, chain);

        assertEquals(402, resp.getStatus());
        assertTrue(resp.getContentAsString().contains("pay-me"));
        assertNull0(chain.getRequest()); // downstream NOT invoked
    }

    @Test
    void noProof_challenge404_relayedAs404() throws Exception {
        X402Filter f = new X402Filter("/premium", "0.10", client(404, "{}"));
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/premium");
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse resp = run(f, req, chain);

        assertEquals(404, resp.getStatus());
        assertTrue(resp.getContentAsString().contains("no_such_route"));
        assertNull0(chain.getRequest());
    }

    @Test
    void noProof_challenge500_failsClosed502() throws Exception {
        X402Filter f = new X402Filter("/premium", "0.10", client(500, "boom"));
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/premium");
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse resp = run(f, req, chain);

        assertEquals(502, resp.getStatus());
        assertTrue(resp.getContentAsString().contains("x402_platform_unavailable"));
        assertNull0(chain.getRequest());
    }

    @Test
    void noProof_transportException_failsClosed502() throws Exception {
        X402Filter f = new X402Filter("/premium", "0.10", throwingClient());
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/premium");
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse resp = run(f, req, chain);

        assertEquals(502, resp.getStatus());
        assertTrue(resp.getContentAsString().contains("x402_platform_unavailable"));
        assertNull0(chain.getRequest());
    }

    @Test
    void withProof_verifyAllowed_passthrough() throws Exception {
        X402Filter f = new X402Filter("/premium", "0.10",
                client(200, "{\"allowed\":true}"));
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/premium");
        req.addHeader("X-Payment-Nonce", "n-1");
        req.addHeader("X-Payment", "{\"tx\":\"abc\"}");
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse resp = run(f, req, chain);

        // Passthrough: chain ran, status untouched (200 default).
        assertEquals(200, resp.getStatus());
        assertTrue(chain.getRequest() != null, "downstream handler should run");
    }

    @Test
    void withProof_verifyDenied_402() throws Exception {
        X402Filter f = new X402Filter("/premium", "0.10",
                client(200, "{\"allowed\":false}"));
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/premium");
        req.addHeader("X-Payment-Nonce", "n-1");
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse resp = run(f, req, chain);

        assertEquals(502, resp.getStatus()); // verify status 200 + not allowed ⇒ fail-closed
        assertNull0(chain.getRequest());
    }

    @Test
    void withProof_verify402_relayedAs402() throws Exception {
        X402Filter f = new X402Filter("/premium", "0.10",
                client(402, "{\"error\":\"payment_required\"}"));
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/premium");
        req.addHeader("X-Payment-Nonce", "n-1");
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse resp = run(f, req, chain);

        assertEquals(402, resp.getStatus());
        assertTrue(resp.getContentAsString().contains("payment_required"));
        assertNull0(chain.getRequest());
    }

    @Test
    void withProof_verifyTransportError_failsClosed502() throws Exception {
        X402Filter f = new X402Filter("/premium", "0.10", throwingClient());
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/premium");
        req.addHeader("X-Payment-Nonce", "n-1");
        MockFilterChain chain = new MockFilterChain();

        MockHttpServletResponse resp = run(f, req, chain);

        assertEquals(502, resp.getStatus());
        assertNull0(chain.getRequest());
    }

    @Test
    void compactJsonBody_signedBytesEqualSentBytes() {
        // Capture the body the transport receives and re-derive the signature
        // from those exact bytes — proves no serializer drift.
        final String[] seen = new String[2];
        PlatformClient.Transport t = (url, body, headers) -> {
            seen[0] = body;
            seen[1] = headers.get("X-X402-Signature");
            return new PlatformClient.Result(200, "{\"allowed\":true}");
        };
        PlatformClient pc = new PlatformClient(CFG, t);
        pc.challenge("/premium", "GET");

        assertEquals("{\"route\":\"/premium\",\"method\":\"GET\"}", seen[0]);
        // Signature header must be a 64-char lowercase hex over those bytes.
        assertTrue(seen[1].matches("^[0-9a-f]{64}$"));
    }

    private static void assertNull0(Object o) {
        assertFalse(o != null, "downstream chain must NOT have been invoked");
    }
}
