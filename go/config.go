package x402

import (
	"errors"
	"os"
	"strings"
)

// DefaultBaseURL is kept identical to the other SDK references so all
// default to the same platform.
// TODO: replace with the production platform domain before GA.
const DefaultBaseURL = "https://api.x402.dev"

// Config is the resolved server-side configuration.
type Config struct {
	KeyID   string
	Secret  string
	BaseURL string
	Env     string // "production" | "sandbox"
}

// ResolveConfig reads config via the provided getter (pass os.Getenv in
// production; an injected func in tests).
func ResolveConfig(getenv func(string) string) (Config, error) {
	if getenv == nil {
		getenv = os.Getenv
	}
	keyID := getenv("X402_API_KEY")
	secret := getenv("X402_SECRET")
	if keyID == "" || secret == "" {
		return Config{}, errors.New(
			"x402: X402_API_KEY and X402_SECRET must be set (server-side env)")
	}
	mode := strings.ToLower(getenv("X402_ENV"))
	if mode == "" {
		mode = "production"
	}
	base := getenv("X402_BASE_URL")
	if base == "" {
		base = DefaultBaseURL
	}
	env := "production"
	if mode == "sandbox" {
		env = "sandbox"
	}
	return Config{
		KeyID:   keyID,
		Secret:  secret,
		BaseURL: strings.TrimRight(base, "/"),
		Env:     env,
	}, nil
}
