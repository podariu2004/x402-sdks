package x402

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	challengePath  = "/api/v1/challenge"
	verifyPath     = "/api/v1/verify"
	requestTimeout = 10 * time.Second
)

// ChallengeReq / VerifyReq are typed so json.Marshal emits fields in
// declaration order (a Go map would sort keys and break byte-parity with
// JS JSON.stringify). omitempty drops absent optional fields, matching the
// JS reference where undefined keys are dropped by JSON.stringify.
type ChallengeReq struct {
	Route  string `json:"route"`
	Method string `json:"method,omitempty"`
}

type VerifyReq struct {
	Route        string `json:"route"`
	Method       string `json:"method,omitempty"`
	Nonce        string `json:"nonce"`
	Payer        string `json:"payer,omitempty"`
	PaymentProof any    `json:"payment_proof,omitempty"`
}

// PlatformResponse is the relayed platform result. Status 0 == transport
// failure (no HTTP response). Body is always a non-nil object map (any
// non-object/invalid JSON is coerced to an empty map so callers can index
// it safely).
type PlatformResponse struct {
	Status int
	Body   map[string]any
}

type PlatformClient struct {
	cfg  Config
	http *http.Client
}

func NewPlatformClient(cfg Config, httpClient *http.Client) *PlatformClient {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: requestTimeout}
	}
	return &PlatformClient{cfg: cfg, http: httpClient}
}

func (c *PlatformClient) Challenge(req ChallengeReq) PlatformResponse {
	return c.post(challengePath, req)
}

func (c *PlatformClient) Verify(req VerifyReq) PlatformResponse {
	return c.post(verifyPath, req)
}

// compactJSON marshals v as compact JSON with HTML-escaping disabled and
// the encoder's trailing newline trimmed, so the bytes byte-match JS
// JSON.stringify (which does not escape < > & and emits no trailing \n).
func compactJSON(v any) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "", err
	}
	return strings.TrimRight(buf.String(), "\n"), nil
}

func (c *PlatformClient) post(path string, payload any) PlatformResponse {
	failClosed := PlatformResponse{Status: 0, Body: map[string]any{}}

	body, err := compactJSON(payload)
	if err != nil {
		return failClosed
	}

	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+path, strings.NewReader(body))
	if err != nil {
		return failClosed
	}
	httpReq.Header.Set("Content-Type", "application/json")
	for k, v := range SignedHeaders(c.cfg.KeyID, c.cfg.Secret, "POST", path, body) {
		httpReq.Header.Set(k, v)
	}

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return failClosed
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		// Got an HTTP status but the body read failed: surface the status
		// with an empty body (caller treats non-allow as fail-closed).
		return PlatformResponse{Status: resp.StatusCode, Body: map[string]any{}}
	}

	out := map[string]any{}
	var parsed any
	if json.Unmarshal(raw, &parsed) == nil {
		if obj, ok := parsed.(map[string]any); ok {
			out = obj
		}
	}
	return PlatformResponse{Status: resp.StatusCode, Body: out}
}
