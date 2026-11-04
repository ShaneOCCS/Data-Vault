// Package config loads and validates all runtime configuration from
// environment variables. Nothing in this codebase reads os.Getenv directly
// outside this file — every other package receives already-validated values
// through a Config struct, so a missing or malformed setting fails at
// startup instead of surfacing as a confusing runtime error later.
package config

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Config holds every setting the server needs, already parsed and validated.
// Fields are plain Go types (not raw strings) so callers never re-parse them.
type Config struct {
	Port       string
	AppEnv     string // "development" or "production"
	UseKMS     bool
	TOTPIssuer string

	DatabaseURL    string
	SessionKey     []byte   // decoded, >=32 bytes; signs both member and admin JWTs
	AllowedOrigins []string // CORS allowlist, normalized to scheme://host[:port]; empty means no cross-origin access

	LocalEncryptionKey []byte // exactly 32 bytes; only set/used when UseKMS is false
	KMSKeyID           string // only set/used when UseKMS is true
}

// IsProduction reports whether the app is running in production mode.
// Callers use this rather than comparing AppEnv directly so the single
// string literal "production" lives in one place.
func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}

// Load reads every required environment variable, validates it, and returns
// a ready-to-use Config. It returns an error — rather than panicking or
// silently defaulting — for anything required-but-missing or malformed, so
// main() can exit loudly at startup instead of the server booting into a
// half-configured, unsafe state.
func Load() (*Config, error) {
	cfg := &Config{
		Port:       getEnvDefault("PORT", "8080"),
		AppEnv:     getEnvDefault("APP_ENV", "development"),
		TOTPIssuer: getEnvDefault("TOTP_ISSUER", "Medical Vault"),
	}

	if cfg.AppEnv != "development" && cfg.AppEnv != "production" {
		return nil, fmt.Errorf("config: APP_ENV must be \"development\" or \"production\", got %q", cfg.AppEnv)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}
	cfg.DatabaseURL = dbURL

	sessionKeyRaw := os.Getenv("SESSION_KEY")
	if sessionKeyRaw == "" {
		return nil, fmt.Errorf("config: SESSION_KEY is required")
	}
	sessionKey, err := base64.StdEncoding.DecodeString(sessionKeyRaw)
	if err != nil {
		return nil, fmt.Errorf("config: SESSION_KEY must be valid base64: %w", err)
	}
	if len(sessionKey) < 32 {
		return nil, fmt.Errorf("config: SESSION_KEY must decode to at least 32 bytes, got %d", len(sessionKey))
	}
	cfg.SessionKey = sessionKey

	useKMSRaw := getEnvDefault("USE_KMS", "false")
	useKMS, err := strconv.ParseBool(useKMSRaw)
	if err != nil {
		return nil, fmt.Errorf("config: USE_KMS must be a boolean, got %q", useKMSRaw)
	}
	cfg.UseKMS = useKMS

	// Invariant #8: a system holding real patient data must never boot with
	// the dev-only static AES key in production. This is enforced here, in
	// code, rather than left as a checklist item for whoever sets env vars
	// at deploy time — a checklist can be skipped; a failed startup cannot.
	if cfg.IsProduction() && !cfg.UseKMS {
		return nil, fmt.Errorf("config: USE_KMS=false is not allowed when APP_ENV=production (invariant #8)")
	}

	if cfg.UseKMS {
		kmsKeyID := os.Getenv("KMS_KEY_ID")
		if kmsKeyID == "" {
			return nil, fmt.Errorf("config: KMS_KEY_ID is required when USE_KMS=true")
		}
		cfg.KMSKeyID = kmsKeyID
	} else {
		localKeyRaw := os.Getenv("LOCAL_ENCRYPTION_KEY")
		if localKeyRaw == "" {
			return nil, fmt.Errorf("config: LOCAL_ENCRYPTION_KEY is required when USE_KMS=false")
		}
		localKey, err := base64.StdEncoding.DecodeString(localKeyRaw)
		if err != nil {
			return nil, fmt.Errorf("config: LOCAL_ENCRYPTION_KEY must be valid base64: %w", err)
		}
		if len(localKey) != 32 {
			return nil, fmt.Errorf("config: LOCAL_ENCRYPTION_KEY must decode to exactly 32 bytes, got %d", len(localKey))
		}
		cfg.LocalEncryptionKey = localKey
	}

	origins, err := parseOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"), cfg.IsProduction())
	if err != nil {
		return nil, err
	}
	cfg.AllowedOrigins = origins

	return cfg, nil
}

// parseOrigins validates and normalizes CORS_ALLOWED_ORIGINS. Empty input
// means CORS is off (today's behavior — curl, Postman and the deploy
// scripts are unaffected either way, since none of them send an Origin
// header). "*" is rejected outright: Access-Control-Allow-Credentials
// requires an exact origin, never a wildcard, because this API
// authenticates with cookies. In production every origin must be https,
// except http://localhost, which stays allowed so a local frontend dev
// server can be tested against the real deployed API through tunnel.sh.
func parseOrigins(raw string, isProd bool) ([]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}

	var out []string
	for _, part := range strings.Split(raw, ",") {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		if origin == "*" {
			return nil, fmt.Errorf("config: CORS_ALLOWED_ORIGINS cannot be \"*\" — this API authenticates with cookies")
		}
		u, err := url.Parse(origin)
		if err != nil || u.Scheme == "" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			return nil, fmt.Errorf("config: CORS_ALLOWED_ORIGINS entry %q must be scheme://host[:port] with no trailing slash or path", origin)
		}
		if u.Scheme != "http" && u.Scheme != "https" {
			return nil, fmt.Errorf("config: CORS_ALLOWED_ORIGINS entry %q must use http or https", origin)
		}
		if isProd && u.Scheme != "https" && u.Hostname() != "localhost" {
			return nil, fmt.Errorf("config: CORS_ALLOWED_ORIGINS entry %q must use https when APP_ENV=production (only localhost may use http)", origin)
		}
		out = append(out, u.Scheme+"://"+u.Host)
	}
	return out, nil
}

// getEnvDefault returns the environment variable's value, or def if unset.
// Kept as a tiny helper so Load() reads as a flat list of settings rather
// than repeating the "look it up, fall back" branch inline each time.
func getEnvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
