package config

import (
	"encoding/base64"
	"strings"
	"testing"
)

func b64(n int) string { return base64.StdEncoding.EncodeToString(make([]byte, n)) }

// setValidDevEnv sets a minimal, valid development environment; tests then
// override one variable at a time.
func setValidDevEnv(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("SESSION_KEY", b64(32))
	t.Setenv("USE_KMS", "false")
	t.Setenv("LOCAL_ENCRYPTION_KEY", b64(32))
	t.Setenv("KMS_KEY_ID", "")
	t.Setenv("TOTP_ISSUER", "")
}

func TestLoadValidDev(t *testing.T) {
	setValidDevEnv(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || cfg.TOTPIssuer != "Medical Vault" || cfg.IsProduction() || cfg.UseKMS {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if len(cfg.LocalEncryptionKey) != 32 {
		t.Fatal("local key not decoded")
	}
}

func TestLoadValidProduction(t *testing.T) {
	setValidDevEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("USE_KMS", "true")
	t.Setenv("KMS_KEY_ID", "alias/test")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.IsProduction() || cfg.KMSKeyID != "alias/test" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestLoadRejects(t *testing.T) {
	cases := []struct {
		name    string
		env     map[string]string
		wantErr string
	}{
		{"production without KMS (invariant #8)", map[string]string{"APP_ENV": "production"}, "invariant #8"},
		{"unknown APP_ENV", map[string]string{"APP_ENV": "staging"}, "APP_ENV"},
		{"missing DATABASE_URL", map[string]string{"DATABASE_URL": ""}, "DATABASE_URL"},
		{"missing SESSION_KEY", map[string]string{"SESSION_KEY": ""}, "SESSION_KEY"},
		{"short SESSION_KEY", map[string]string{"SESSION_KEY": b64(31)}, "at least 32"},
		{"SESSION_KEY not base64", map[string]string{"SESSION_KEY": "!!!"}, "base64"},
		{"USE_KMS not a bool", map[string]string{"USE_KMS": "maybe"}, "USE_KMS"},
		{"KMS without key id", map[string]string{"USE_KMS": "true"}, "KMS_KEY_ID"},
		{"missing local key", map[string]string{"LOCAL_ENCRYPTION_KEY": ""}, "LOCAL_ENCRYPTION_KEY"},
		{"local key wrong size", map[string]string{"LOCAL_ENCRYPTION_KEY": b64(16)}, "exactly 32"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			setValidDevEnv(t)
			for k, v := range tc.env {
				t.Setenv(k, v)
			}
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("got %v, want error containing %q", err, tc.wantErr)
			}
		})
	}
}
