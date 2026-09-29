package auth

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

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
