package x402

import (
	"encoding/json"
	"net/http"
)

// clientIface is the challenge/verify seam (PlatformClient implements it;
// tests inject a fake).
type clientIface interface {
	Challenge(ChallengeReq) PlatformResponse
	Verify(VerifyReq) PlatformResponse
}

// Opts configures the middleware. Price is a telemetry hint only; the
// authoritative price is the merchant route registered on the platform.
// Route overrides the route key sent to the platform (default: r.URL.Path).
type Opts struct {
	Price   string
	Route   string
	Config  *Config
	Client  clientIface
	OnError func(error)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// Middleware gates an http.Handler behind an x402 payment. No
// business/settlement logic — relays to the platform's signed
// challenge/verify and fails closed. next runs ONLY when the platform
// explicitly allows the request.
//
//	mux.Handle("/premium", x402.Middleware(x402.Opts{Price: "0.10"})(h))
func Middleware(opts Opts) func(http.Handler) http.Handler {
	client := opts.Client
	if client == nil {
		cfg := opts.Config
		if cfg == nil {
			c, err := ResolveConfig(nil)
			if err != nil {
				panic("x402: " + err.Error())
			}
			cfg = &c
		}
		client = NewPlatformClient(*cfg, nil)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			route := opts.Route
			if route == "" {
				route = r.URL.Path
			}
			method := r.Method

			failClosed := func() {
				writeJSON(w, http.StatusBadGateway, map[string]string{"error": "x402_platform_unavailable"})
			}

			proofNonce := r.Header.Get("X-Payment-Nonce")
			if proofNonce == "" {
				ch := client.Challenge(ChallengeReq{Route: route, Method: method})
				switch ch.Status {
				case 200:
					writeJSON(w, http.StatusPaymentRequired, ch.Body)
				case 404:
					writeJSON(w, http.StatusNotFound, ch.Body)
				default:
					failClosed()
				}
				return
			}

			var proof any
			if raw := r.Header.Get("X-Payment"); raw != "" {
				var decoded any
				if json.Unmarshal([]byte(raw), &decoded) == nil {
					proof = decoded
				} else {
					proof = raw // forward raw; platform is the single decision point
				}
			}

			vr := client.Verify(VerifyReq{
				Route:        route,
				Method:       method,
				Nonce:        proofNonce,
				Payer:        r.Header.Get("X-Payment-Payer"),
				PaymentProof: proof,
			})

			if vr.Status == 200 {
				if allowed, ok := vr.Body["allowed"].(bool); ok && allowed {
					next.ServeHTTP(w, r)
					return
				}
			}
			if vr.Status == 402 {
				writeJSON(w, http.StatusPaymentRequired, vr.Body)
				return
			}
			failClosed()
		})
	}
}
