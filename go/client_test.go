package x402

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func newResp(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
}

func testCfg() Config {
	return Config{KeyID: "x402_test_k", Secret: "x402sk_test_s", BaseURL: "https://plat.test", Env: "sandbox"}
}

func TestPostSignsExactOrderedBytesAndPath(t *testing.T) {
	var gotURL, gotBody string
	var gotHeaders http.Header
	rt := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotURL = r.URL.String()
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		gotHeaders = r.Header
		return newResp(200, `{"paymentRequired":true}`), nil
	})
	c := NewPlatformClient(testCfg(), &http.Client{Transport: rt})
	res := c.Challenge(ChallengeReq{Route: "/premium", Method: "GET"})

	if res.Status != 200 || res.Body["paymentRequired"] != true {
		t.Fatalf("unexpected response: %+v", res)
	}
	if gotURL != "https://plat.test/api/v1/challenge" {
		t.Fatalf("url = %q", gotURL)
	}
	// Struct field order preserved, slash not escaped, no HTML-escape, no trailing newline.
	if gotBody != `{"route":"/premium","method":"GET"}` {
		t.Fatalf("body bytes = %q", gotBody)
	}
	if gotHeaders.Get("Content-Type") != "application/json" {
		t.Fatalf("content-type = %q", gotHeaders.Get("Content-Type"))
	}
	ts := gotHeaders.Get("X-X402-Timestamp")
	var tsi int64
	for _, ch := range ts {
		tsi = tsi*10 + int64(ch-'0')
	}
	if gotHeaders.Get("X-X402-Signature") != Sign("x402sk_test_s", "POST", "/api/v1/challenge", tsi, gotHeaders.Get("X-X402-Nonce"), gotBody) {
		t.Fatal("signature does not match exact sent bytes")
	}
}

func TestVerifyOmitsAbsentOptionalFieldsAndEscapesNothing(t *testing.T) {
	var gotBody string
	rt := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		return newResp(200, `{"allowed":true}`), nil
	})
	c := NewPlatformClient(testCfg(), &http.Client{Transport: rt})
	c.Verify(VerifyReq{Route: "/п", Method: "GET", Nonce: "n"})
	// payer + payment_proof omitted (omitempty); unicode raw UTF-8 (no \u escaping); & < > not HTML-escaped.
	if gotBody != `{"route":"/п","method":"GET","nonce":"n"}` {
		t.Fatalf("verify body = %q", gotBody)
	}
}

func TestTransportErrorIsStatusZeroFailClosed(t *testing.T) {
	rt := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return nil, errors.New("boom")
	})
	c := NewPlatformClient(testCfg(), &http.Client{Transport: rt})
	res := c.Verify(VerifyReq{Route: "/p", Method: "GET", Nonce: "n"})
	if res.Status != 0 || len(res.Body) != 0 {
		t.Fatalf("expected fail-closed {0,{}}, got %+v", res)
	}
}

func TestNonObjectJSONBecomesEmptyMap(t *testing.T) {
	for _, payload := range []string{`[1,2,3]`, `42`, `null`, `"hi"`, `not json`} {
		rt := roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return newResp(500, payload), nil
		})
		c := NewPlatformClient(testCfg(), &http.Client{Transport: rt})
		res := c.Challenge(ChallengeReq{Route: "/p", Method: "GET"})
		if res.Status != 500 || len(res.Body) != 0 {
			t.Fatalf("payload %q: expected {500,{}}, got %+v", payload, res)
		}
	}
}
