package x402

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeClient struct {
	ch    PlatformResponse
	vr    PlatformResponse
	calls []string
	last  any
}

func (f *fakeClient) Challenge(r ChallengeReq) PlatformResponse {
	f.calls = append(f.calls, "challenge")
	f.last = r
	return f.ch
}

func (f *fakeClient) Verify(r VerifyReq) PlatformResponse {
	f.calls = append(f.calls, "verify")
	f.last = r
	return f.vr
}

func paidHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":"paid content"}`)
	})
}

func serve(h http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func decode(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatalf("decode body %q: %v", rr.Body.String(), err)
	}
	return m
}

func mw(f *fakeClient) func(http.Handler) http.Handler {
	return Middleware(Opts{Price: "0.10", Client: f})
}

func TestNoProofReturns402WithChallengeBody(t *testing.T) {
	f := &fakeClient{ch: PlatformResponse{Status: 200, Body: map[string]any{"paymentRequired": true, "amount": "0.10"}}}
	rr := serve(mw(f)(paidHandler()), httptest.NewRequest("GET", "/premium", nil))
	if rr.Code != 402 {
		t.Fatalf("status = %d, want 402", rr.Code)
	}
	b := decode(t, rr)
	if b["paymentRequired"] != true || b["amount"] != "0.10" {
		t.Fatalf("challenge body = %+v", b)
	}
	if f.calls[0] != "challenge" {
		t.Fatalf("calls = %v", f.calls)
	}
	cr := f.last.(ChallengeReq)
	if cr.Route != "/premium" || cr.Method != "GET" {
		t.Fatalf("challenge req = %+v", cr)
	}
}

func TestUnknownRouteReturns404(t *testing.T) {
	f := &fakeClient{ch: PlatformResponse{Status: 404, Body: map[string]any{"error": "no_such_route"}}}
	rr := serve(mw(f)(paidHandler()), httptest.NewRequest("GET", "/premium", nil))
	if rr.Code != 404 || decode(t, rr)["error"] != "no_such_route" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestPlatformUnreachableFailsClosed502(t *testing.T) {
	f := &fakeClient{ch: PlatformResponse{Status: 0, Body: map[string]any{}}}
	rr := serve(mw(f)(paidHandler()), httptest.NewRequest("GET", "/premium", nil))
	if rr.Code != 502 || decode(t, rr)["error"] != "x402_platform_unavailable" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestProofPresentAndAllowedRunsNext(t *testing.T) {
	f := &fakeClient{vr: PlatformResponse{Status: 200, Body: map[string]any{"allowed": true}}}
	req := httptest.NewRequest("GET", "/premium", nil)
	req.Header.Set("X-Payment-Nonce", "n1")
	req.Header.Set("X-Payment-Payer", "0xabc")
	req.Header.Set("X-Payment", `{"tx":"0x1"}`)
	rr := serve(mw(f)(paidHandler()), req)
	if rr.Code != 200 || decode(t, rr)["data"] != "paid content" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
	vr := f.last.(VerifyReq)
	if vr.Route != "/premium" || vr.Nonce != "n1" || vr.Payer != "0xabc" {
		t.Fatalf("verify req = %+v", vr)
	}
	if m, ok := vr.PaymentProof.(map[string]any); !ok || m["tx"] != "0x1" {
		t.Fatalf("payment_proof = %+v", vr.PaymentProof)
	}
}

func TestProofDeniedReturns402(t *testing.T) {
	f := &fakeClient{vr: PlatformResponse{Status: 402, Body: map[string]any{"allowed": false, "reason": "unpaid"}}}
	req := httptest.NewRequest("GET", "/premium", nil)
	req.Header.Set("X-Payment-Nonce", "n1")
	rr := serve(mw(f)(paidHandler()), req)
	if rr.Code != 402 || decode(t, rr)["reason"] != "unpaid" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestNonJSONXPaymentForwardedRaw(t *testing.T) {
	f := &fakeClient{vr: PlatformResponse{Status: 200, Body: map[string]any{"allowed": true}}}
	req := httptest.NewRequest("GET", "/premium", nil)
	req.Header.Set("X-Payment-Nonce", "n1")
	req.Header.Set("X-Payment", "not-json")
	serve(mw(f)(paidHandler()), req)
	if f.last.(VerifyReq).PaymentProof != "not-json" {
		t.Fatalf("payment_proof = %+v", f.last.(VerifyReq).PaymentProof)
	}
}

func TestVerify5xxFailsClosed502(t *testing.T) {
	f := &fakeClient{vr: PlatformResponse{Status: 500, Body: map[string]any{"allowed": false}}}
	req := httptest.NewRequest("GET", "/premium", nil)
	req.Header.Set("X-Payment-Nonce", "n1")
	rr := serve(mw(f)(paidHandler()), req)
	if rr.Code != 502 {
		t.Fatalf("status = %d, want 502", rr.Code)
	}
}

func TestAllowedMustBeStrictlyTrue(t *testing.T) {
	for _, bad := range []any{"true", 1, float64(1), "yes", nil} {
		f := &fakeClient{vr: PlatformResponse{Status: 200, Body: map[string]any{"allowed": bad}}}
		req := httptest.NewRequest("GET", "/premium", nil)
		req.Header.Set("X-Payment-Nonce", "n1")
		rr := serve(mw(f)(paidHandler()), req)
		if rr.Code != 502 {
			t.Fatalf("allowed=%v(%T): status = %d, want 502", bad, bad, rr.Code)
		}
	}
}

func TestExplicitRouteOverride(t *testing.T) {
	f := &fakeClient{ch: PlatformResponse{Status: 200, Body: map[string]any{"paymentRequired": true}}}
	h := Middleware(Opts{Route: "/premium", Client: f})(paidHandler())
	serve(h, httptest.NewRequest("GET", "/mounted/thing", nil))
	if f.last.(ChallengeReq).Route != "/premium" {
		t.Fatalf("route = %q", f.last.(ChallengeReq).Route)
	}
}
