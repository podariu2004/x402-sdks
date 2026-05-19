package x402

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

type vectors struct {
	KAT struct {
		Secret    string `json:"secret"`
		Method    string `json:"method"`
		Path      string `json:"path"`
		Timestamp int64  `json:"timestamp"`
		Nonce     string `json:"nonce"`
		Body      string `json:"body"`
		BodySHA   string `json:"body_sha256"`
		Canonical string `json:"canonical"`
		Signature string `json:"signature"`
	} `json:"kat"`
	BodyHashes []struct {
		Body   string `json:"body"`
		SHA256 string `json:"sha256"`
	} `json:"body_hashes"`
}

func loadVectors(t *testing.T) vectors {
	t.Helper()
	p := filepath.Join("..", "..", "docs", "api", "x402-conformance-vectors.json")
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read shared vectors: %v", err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("parse shared vectors: %v", err)
	}
	return v
}

func TestSchemeIsFrozen(t *testing.T) {
	if Scheme != "X402v1" {
		t.Fatalf("Scheme = %q, want X402v1", Scheme)
	}
}

func TestCanonicalIsFrozenLayout(t *testing.T) {
	v := loadVectors(t)
	got := Canonical("post", "/api/v1/verify", 1700000000, "nonce-1", `{"a":1}`)
	sum := sha256.Sum256([]byte(`{"a":1}`))
	want := "X402v1\nPOST\n/api/v1/verify\n1700000000\nnonce-1\n" + hex.EncodeToString(sum[:])
	if got != want {
		t.Fatalf("canonical mismatch\n got=%q\nwant=%q", got, want)
	}
	if got != v.KAT.Canonical {
		t.Fatalf("canonical != shared vector\n got=%q\nwant=%q", got, v.KAT.Canonical)
	}
}

func TestEmptyBodyHash(t *testing.T) {
	v := loadVectors(t)
	got := Canonical("GET", "/api/v1/challenge", 1, "n", "")
	if !regexpEndsWith(got, "\n"+v.BodyHashes[0].SHA256) {
		t.Fatalf("empty-body hash suffix mismatch: %q", got)
	}
}

func TestKATSignatureMatchesSharedVector(t *testing.T) {
	v := loadVectors(t)
	got := Sign(v.KAT.Secret, v.KAT.Method, v.KAT.Path, v.KAT.Timestamp, v.KAT.Nonce, v.KAT.Body)
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(got) {
		t.Fatalf("signature not lowercase-hex-64: %q", got)
	}
	if got != v.KAT.Signature {
		t.Fatalf("KAT signature mismatch\n got=%s\nwant=%s", got, v.KAT.Signature)
	}
}

func TestUnicodeBodyHashesRawUTF8(t *testing.T) {
	body := `{"name":"こんにちは"}`
	got := Canonical("POST", "/api/v1/verify", 1700000000, "n", body)
	sum := sha256.Sum256([]byte(body))
	if !regexpEndsWith(got, "\n"+hex.EncodeToString(sum[:])) {
		t.Fatalf("unicode body hash mismatch: %q", got)
	}
}

func TestSignedHeadersShape(t *testing.T) {
	h := SignedHeaders("x402_test_abc", "x402sk_test_x", "POST", "/api/v1/challenge", `{"route":"/p"}`)
	if h["X-X402-Key"] != "x402_test_abc" {
		t.Fatalf("key header = %q", h["X-X402-Key"])
	}
	if !regexp.MustCompile(`^\d+$`).MatchString(h["X-X402-Timestamp"]) {
		t.Fatalf("timestamp not integer: %q", h["X-X402-Timestamp"])
	}
	if len(h["X-X402-Nonce"]) < 16 {
		t.Fatalf("nonce too short: %q", h["X-X402-Nonce"])
	}
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(h["X-X402-Signature"]) {
		t.Fatalf("signature not hex64: %q", h["X-X402-Signature"])
	}
}

func TestSignedHeadersNoncesUnique(t *testing.T) {
	a := SignedHeaders("k", "s", "POST", "/api/v1/challenge", "")
	b := SignedHeaders("k", "s", "POST", "/api/v1/challenge", "")
	if a["X-X402-Nonce"] == b["X-X402-Nonce"] {
		t.Fatal("nonces not unique across calls")
	}
}

func TestSharedVectorsFullConformance(t *testing.T) {
	v := loadVectors(t)
	for _, bh := range v.BodyHashes {
		sum := sha256.Sum256([]byte(bh.Body))
		if hex.EncodeToString(sum[:]) != bh.SHA256 {
			t.Fatalf("body hash mismatch for %q", bh.Body)
		}
	}
	if Canonical(v.KAT.Method, v.KAT.Path, v.KAT.Timestamp, v.KAT.Nonce, v.KAT.Body) != v.KAT.Canonical {
		t.Fatal("canonical drift vs shared vector")
	}
	if Sign(v.KAT.Secret, v.KAT.Method, v.KAT.Path, v.KAT.Timestamp, v.KAT.Nonce, v.KAT.Body) != v.KAT.Signature {
		t.Fatal("signature drift vs shared vector")
	}
}

func regexpEndsWith(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}
