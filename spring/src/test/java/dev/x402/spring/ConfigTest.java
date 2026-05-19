package dev.x402.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

class ConfigTest {

    private static java.util.function.Function<String, String> env(Map<String, String> m) {
        return m::get;
    }

    @Test
    void missingCredentialsThrows() {
        assertThrows(IllegalStateException.class,
                () -> X402Config.resolve(env(new HashMap<>())));
        Map<String, String> onlyKey = new HashMap<>();
        onlyKey.put("X402_API_KEY", "k");
        assertThrows(IllegalStateException.class, () -> X402Config.resolve(env(onlyKey)));
    }

    @Test
    void defaultsApplied() {
        Map<String, String> m = new HashMap<>();
        m.put("X402_API_KEY", "key");
        m.put("X402_SECRET", "sk");
        X402Config c = X402Config.resolve(env(m));
        assertEquals("key", c.keyId);
        assertEquals("sk", c.secret);
        assertEquals("production", c.env);
        assertEquals(X402Config.DEFAULT_BASE_URL, c.baseUrl);
    }

    @Test
    void sandboxEnvAndTrailingSlashStripped() {
        Map<String, String> m = new HashMap<>();
        m.put("X402_API_KEY", "key");
        m.put("X402_SECRET", "sk");
        m.put("X402_ENV", "SANDBOX");
        m.put("X402_BASE_URL", "https://example.test/api///");
        X402Config c = X402Config.resolve(env(m));
        assertEquals("sandbox", c.env);
        assertEquals("https://example.test/api", c.baseUrl);
    }

    @Test
    void unknownEnvFallsBackToProduction() {
        Map<String, String> m = new HashMap<>();
        m.put("X402_API_KEY", "key");
        m.put("X402_SECRET", "sk");
        m.put("X402_ENV", "weird");
        assertEquals("production", X402Config.resolve(env(m)).env);
    }
}
