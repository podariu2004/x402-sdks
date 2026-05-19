package x402

import "testing"

func TestResolveConfigFromInjectedEnv(t *testing.T) {
	env := map[string]string{"X402_API_KEY": "x402_test_k", "X402_SECRET": "x402sk_test_s"}
	c, err := ResolveConfig(func(k string) string { return env[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.KeyID != "x402_test_k" || c.Secret != "x402sk_test_s" {
		t.Fatalf("creds mismatch: %+v", c)
	}
	if c.BaseURL != DefaultBaseURL {
		t.Fatalf("baseURL = %q, want %q", c.BaseURL, DefaultBaseURL)
	}
	if c.Env != "production" {
		t.Fatalf("env = %q, want production", c.Env)
	}
}

func TestResolveConfigSandboxAndTrailingSlash(t *testing.T) {
	env := map[string]string{
		"X402_API_KEY":  "k",
		"X402_SECRET":   "s",
		"X402_ENV":      "SANDBOX",
		"X402_BASE_URL": "https://staging.example.com///",
	}
	c, err := ResolveConfig(func(k string) string { return env[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.Env != "sandbox" {
		t.Fatalf("env = %q, want sandbox", c.Env)
	}
	if c.BaseURL != "https://staging.example.com" {
		t.Fatalf("baseURL = %q", c.BaseURL)
	}
}

func TestResolveConfigMissingCredentials(t *testing.T) {
	cases := []map[string]string{
		{},
		{"X402_API_KEY": "k"},
		{"X402_SECRET": "s"},
	}
	for i, env := range cases {
		if _, err := ResolveConfig(func(k string) string { return env[k] }); err == nil {
			t.Fatalf("case %d: expected error, got nil", i)
		}
	}
}
