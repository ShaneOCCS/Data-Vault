package auth

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

const (
	inviteTokenCharset = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	inviteTokenLength  = 32 // long and single-purpose, so no hyphenated grouping needed — it's pasted from an email link, not typed
)

// GenerateInviteToken mints a single-use plaintext token for
// POST /api/admin/invites. Its shape mirrors recovery keys (random,
// bcrypt-hashed at rest, single-use) because it's solving the same
// problem: prove possession of a secret handed out once, out-of-band.
func GenerateInviteToken() (string, error) {
	return randomStringFromCharset(inviteTokenCharset, inviteTokenLength)
}

// HashInviteToken bcrypt-hashes a plaintext invite token for storage in
// admin_invites.token_hash.
func HashInviteToken(plaintext string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("auth: hash invite token: %w", err)
	}
	return string(hash), nil
}

// CompareInviteToken reports whether plaintext matches a stored bcrypt
// hash. Callers must additionally check used_at and expires_at themselves —
// this function only proves knowledge of the secret, not eligibility.
func CompareInviteToken(hash, plaintext string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)) == nil
}
