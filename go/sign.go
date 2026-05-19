// Package x402 is a thin stdlib-only Go client for the x402 paywall
// platform implementing the frozen X402v1 wire contract
// (docs/api/x402-contract.md):
//
//	canonical = "X402v1" LF METHOD LF path LF timestamp LF nonce LF sha256hex(body)
//	signature = HMAC-SHA256(secret, canonical), lowercase hex (64 chars)
package x402

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Scheme is the canonical-string version. MUST match the platform's
// X402ApiKey::SCHEME.
const Scheme = "X402v1"

// Canonical builds the frozen six-field canonical string. timestamp is an
// int64 (unix seconds): the type makes a non-integer impossible at the call
// site, satisfying the contract's integer rule structurally.
func Canonical(method, path string, timestamp int64, nonce, body string) string {
	sum := sha256.Sum256([]byte(body)) // body hashed as raw bytes — matches Node/Python/PHP
	return strings.Join([]string{
		Scheme,
		strings.ToUpper(method),
		path,
		strconv.FormatInt(timestamp, 10),
		nonce,
		hex.EncodeToString(sum[:]),
	}, "\n")
}

// Sign returns the lowercase-hex HMAC-SHA256 of the canonical string.
func Sign(secret, method, path string, timestamp int64, nonce, body string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(Canonical(method, path, timestamp, nonce, body)))
	return hex.EncodeToString(mac.Sum(nil))
}

// SignedHeaders returns the four X-X402 headers with a fresh nonce.
func SignedHeaders(keyID, secret, method, path, body string) map[string]string {
	ts := time.Now().Unix()
	nonce := uuid4()
	return map[string]string{
		"X-X402-Key":       keyID,
		"X-X402-Timestamp": strconv.FormatInt(ts, 10),
		"X-X402-Nonce":     nonce,
		"X-X402-Signature": Sign(secret, method, path, ts, nonce, body),
	}
}

// uuid4 is an RFC 4122 v4 UUID from crypto/rand (no external dependency).
func uuid4() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("x402: crypto/rand unavailable: " + err.Error())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
