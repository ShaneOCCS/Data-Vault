package auth

import (
	"fmt"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

// MinAdminPasswordLength and MaxAdminPasswordBytes bound an admin password.
// The minimum is the one policy both admin-creation paths (bootstrap-admin
// and AcceptInvite) enforce through ValidateAdminPassword. The maximum is
// bcrypt's own input limit: anything longer is rejected by
// bcrypt.GenerateFromPassword, so it's checked up front as a clear
// validation error instead of surfacing as a 500.
const (
	MinAdminPasswordLength = 12
	MaxAdminPasswordBytes  = 72
)

// ErrPasswordTooShort and ErrPasswordTooLong are returned by
// ValidateAdminPassword. Their messages are safe to show to the caller.
var (
	ErrPasswordTooShort = fmt.Errorf("password must be at least %d characters", MinAdminPasswordLength)
	ErrPasswordTooLong  = fmt.Errorf("password must be at most %d bytes", MaxAdminPasswordBytes)
)

// ValidateAdminPassword enforces the admin password policy. Length is
// counted in characters (runes) for the minimum, so a password of
// non-ASCII characters isn't penalized, and in bytes for the maximum,
// since that's what bcrypt limits.
func ValidateAdminPassword(plaintext string) error {
	if utf8.RuneCountInString(plaintext) < MinAdminPasswordLength {
		return ErrPasswordTooShort
	}
	if len(plaintext) > MaxAdminPasswordBytes {
		return ErrPasswordTooLong
	}
	return nil
}

// HashPassword bcrypt-hashes an admin's typed password. Admins are the only
// principal in this system with a typed password — members authenticate
// with a KIT ID + TOTP code and never type a password (see invariant #3).
func HashPassword(plaintext string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("auth: hash password: %w", err)
	}
	return string(hash), nil
}

// ComparePassword reports whether plaintext matches a stored bcrypt hash.
func ComparePassword(hash, plaintext string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)) == nil
}
