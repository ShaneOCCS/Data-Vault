package auth

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// Recovery key purposes. These match the CHECK constraint on
// recovery_keys.purpose in migrations/0001_init.sql exactly — a key minted
// with one purpose can never be redeemed by an endpoint that requires the
// other (see claude.md "Recovery keys have a purpose").
const (
	RecoveryPurposeSignup   = "signup"
	RecoveryPurposeRecovery = "recovery"
)

// kitIDCharset deliberately excludes 0/O and 1/I/L, the character pairs
// people misread most often when copying a KIT ID off a printed card or
// reading it aloud — this isn't a security measure, just fewer support
// tickets.
const kitIDCharset = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

const kitIDLength = 7

// GenerateKitID returns one random 7-character KIT ID candidate. It does
// not check the database for collisions — callers (see admin.go's
// provisionOneMember) are expected to insert-and-retry, since a random
// 7-character code over a 31-symbol alphabet collides rarely enough that
// checking here would just be a second, redundant round trip.
func GenerateKitID() (string, error) {
	return randomStringFromCharset(kitIDCharset, kitIDLength)
}

// recoveryKeyCharset is intentionally larger and includes lowercase to
// maximize entropy per character — unlike a KIT ID, a recovery key is
// typed once during enrollment/recovery and never read aloud, so
// readability matters less than keeping the key short enough to
// realistically type.
const recoveryKeyCharset = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const recoveryKeySegmentLen = 5

// GenerateRecoveryKeys mints n plaintext recovery keys for the given
// purpose, formatted as four hyphen-separated 5-character segments (e.g.
// "aB3dE-fGh4j-..."), which is long enough to resist guessing and short
// enough for a member to type from a printed card. It validates purpose
// against the two allowed values up front so a typo in caller code fails
// immediately instead of silently writing a bad row.
func GenerateRecoveryKeys(purpose string, n int) ([]string, error) {
	if purpose != RecoveryPurposeSignup && purpose != RecoveryPurposeRecovery {
		return nil, fmt.Errorf("auth: invalid recovery key purpose %q", purpose)
	}
	keys := make([]string, n)
	for i := range keys {
		segments := make([]string, 4)
		for j := range segments {
			s, err := randomStringFromCharset(recoveryKeyCharset, recoveryKeySegmentLen)
			if err != nil {
				return nil, err
			}
			segments[j] = s
		}
		keys[i] = strings.Join(segments, "-")
	}
	return keys, nil
}

// HashRecoveryKey bcrypt-hashes a plaintext recovery key for storage.
// Recovery keys are single-use and compared only at redemption time, so
// bcrypt's cost is a non-issue in practice (one comparison per attempt).
func HashRecoveryKey(plaintext string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("auth: hash recovery key: %w", err)
	}
	return string(hash), nil
}

// CompareRecoveryKey reports whether plaintext matches a stored bcrypt
// hash. Callers must additionally check purpose and used_at themselves —
// this function only proves knowledge of the secret, not eligibility.
func CompareRecoveryKey(hash, plaintext string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)) == nil
}

// randomStringFromCharset draws length characters from charset using
// crypto/rand, never math/rand — every code in this file is a credential,
// and math/rand is not safe for that.
func randomStringFromCharset(charset string, length int) (string, error) {
	b := make([]byte, length)
	max := big.NewInt(int64(len(charset)))
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", fmt.Errorf("auth: read random: %w", err)
		}
		b[i] = charset[n.Int64()]
	}
	return string(b), nil
}
