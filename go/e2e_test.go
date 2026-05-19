package x402

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Full test-mode flow against a real httptest platform: agent hits the
// gate with no proof (→402 challenge), "pays", retries with the nonce
// (→allow). Exercises Sign + PlatformClient + Middleware over real HTTP.
func TestFullTestModeFlow(t *testing.T) {
	platform := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/challenge":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"paymentRequired": true, "amount": "0.10", "currency": "USDC",
				"network": "base", "recipient": "0xPLAT", "resource": "/premium",
				"nonce": "chal-nonce-1", "expiresAt": "2030-01-01T00:00:00+00:00",
			})
		case "/api/v1/verify":
			b, _ := io.ReadAll(r.Body)
			var sent map[string]any
			_ = json.Unmarshal(b, &sent)
			if sent["nonce"] == "chal-nonce-1" {
				_ = json.NewEncoder(w).Encode(map[string]any{"allowed": true})
			} else {
				w.WriteHeader(402)
				_ = json.NewEncoder(w).Encode(map[string]any{"allowed": false, "reason": "bad_nonce"})
			}
		default:
			w.WriteHeader(404)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "no_such_route"})
		}
	}))
	defer platform.Close()

	cfg := Config{KeyID: "x402_test_k", Secret: "x402sk_test_s", BaseURL: platform.URL, Env: "sandbox"}
	client := NewPlatformClient(cfg, platform.Client())
	h := Middleware(Opts{Price: "0.10", Client: client})(paidHandler())

	// 1. No proof → 402 challenge
	rr1 := serve(h, httptest.NewRequest("GET", "/premium", nil))
	if rr1.Code != 402 {
		t.Fatalf("first call status = %d, want 402", rr1.Code)
	}
	var challenge map[string]any
	if err := json.Unmarshal(rr1.Body.Bytes(), &challenge); err != nil {
		t.Fatalf("challenge decode: %v", err)
	}
	if challenge["paymentRequired"] != true || challenge["nonce"] != "chal-nonce-1" {
		t.Fatalf("challenge = %+v", challenge)
	}

	// 2. Retry with the nonce → allow
	req2 := httptest.NewRequest("GET", "/premium", nil)
	req2.Header.Set("X-Payment-Nonce", challenge["nonce"].(string))
	rr2 := serve(h, req2)
	if rr2.Code != 200 {
		t.Fatalf("paid call status = %d, want 200", rr2.Code)
	}
	if got := decode(t, rr2)["data"]; got != "paid content" {
		t.Fatalf("paid body data = %v", got)
	}
}
