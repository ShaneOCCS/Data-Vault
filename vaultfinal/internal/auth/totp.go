// Package auth holds every credential-related primitive: TOTP, recovery
// keys, admin passwords, invite tokens, and the two JWT session managers.
// Nothing here talks to the database or HTTP — it's pure logic that
// handlers and the store package call into.
package auth

import (
	"fmt"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

// GenerateTOTP creates a brand-new TOTP secret for one member and returns
// both the raw secret (to encrypt and store) and the otpauth:// URL (to
// render as a QR code for the member's authenticator app). issuer is shown
// in the app as the service name; accountName is shown as the account label
// — we pass the KIT ID so members can tell accounts apart if they ever
// enroll more than one.
func GenerateTOTP(issuer, accountName string) (secret string, otpauthURL string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: accountName,
	})
	if err != nil {
		return "", "", fmt.Errorf("auth: generate totp: %w", err)
	}
	return key.Secret(), key.URL(), nil
}

// VerifyTOTP checks a 6-digit code against a decrypted secret, allowing the
// default one-step clock skew window (otp's library default) so a member
// whose phone clock is a few seconds off isn't locked out.
func VerifyTOTP(secret, code string) bool {
	valid, err := totp.ValidateCustom(code, secret, time.Now(), totp.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	if err != nil {
		return false
	}
	return valid
}
