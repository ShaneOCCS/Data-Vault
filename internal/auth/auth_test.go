package auth

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pquerna/otp/totp"
)

var testKey = []byte("0123456789abcdef0123456789abcdef")

func TestGenerateKitID(t *testing.T) {
	seen := map[string]bool{}
	for range 200 {
		id, err := GenerateKitID()
		if err != nil {
			t.Fatal(err)
		}
		if len(id) != kitIDLength {
			t.Fatalf("len(%q) = %d, want %d", id, len(id), kitIDLength)
		}
		for _, c := range id {
			if !strings.ContainsRune(kitIDCharset, c) {
				t.Fatalf("%q contains %q, outside the KIT ID alphabet", id, c)
			}
		}
		seen[id] = true
	}
	if len(seen) < 195 {
		t.Fatalf("only %d distinct IDs out of 200; generator looks broken", len(seen))
	}
}

func TestGenerateRecoveryKeys(t *testing.T) {
	keys, err := GenerateRecoveryKeys(RecoveryPurposeRecovery, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 3 {
		t.Fatalf("got %d keys, want 3", len(keys))
	}
	for _, k := range keys {
		segs := strings.Split(k, "-")
		if len(segs) != 4 {
			t.Fatalf("%q: want 4 segments", k)
		}
		for _, s := range segs {
			if len(s) != recoveryKeySegmentLen {
				t.Fatalf("%q: segment %q has wrong length", k, s)
			}
		}
	}
	if keys[0] == keys[1] {
		t.Fatal("two generated keys are identical")
	}
}

func TestGenerateRecoveryKeysRejectsUnknownPurpose(t *testing.T) {
	if _, err := GenerateRecoveryKeys("admin", 1); err == nil {
		t.Fatal("expected an error for an unknown purpose")
	}
}

func TestRecoveryKeyHashRoundTrip(t *testing.T) {
	keys, _ := GenerateRecoveryKeys(RecoveryPurposeSignup, 1)
	hash, err := HashRecoveryKey(keys[0])
	if err != nil {
		t.Fatal(err)
	}
	if hash == keys[0] {
		t.Fatal("hash equals plaintext")
	}
	if !CompareRecoveryKey(hash, keys[0]) {
		t.Fatal("correct key did not match its hash")
	}
	if CompareRecoveryKey(hash, keys[0]+"x") {
		t.Fatal("wrong key matched")
	}
}

func TestInviteTokenRoundTrip(t *testing.T) {
	tok, err := GenerateInviteToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(tok) != inviteTokenLength {
		t.Fatalf("token length %d, want %d", len(tok), inviteTokenLength)
	}
	hash, err := HashInviteToken(tok)
	if err != nil {
		t.Fatal(err)
	}
	if !CompareInviteToken(hash, tok) || CompareInviteToken(hash, "nope") {
		t.Fatal("invite token compare is wrong")
	}
}

func TestValidateAdminPassword(t *testing.T) {
	cases := []struct {
		name     string
		password string
		want     error
	}{
		{"empty", "", ErrPasswordTooShort},
		{"11 chars", "abcdefghijk", ErrPasswordTooShort},
		{"12 chars", "abcdefghijkl", nil},
		{"12 non-ASCII chars", "ééééééééééé" + "é", nil}, // 24 bytes, 12 characters
		{"72 bytes", strings.Repeat("a", 72), nil},
		{"73 bytes", strings.Repeat("a", 73), ErrPasswordTooLong},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ValidateAdminPassword(tc.password); !errors.Is(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !ComparePassword(hash, "correct horse battery") || ComparePassword(hash, "wrong horse battery") {
		t.Fatal("password compare is wrong")
	}
}

func TestMemberSessionRoundTrip(t *testing.T) {
	m := NewSessionManager(testKey)
	tok, err := m.Issue("AB3CD7K")
	if err != nil {
		t.Fatal(err)
	}
	kit, err := m.Parse(tok)
	if err != nil {
		t.Fatal(err)
	}
	if kit != "AB3CD7K" {
		t.Fatalf("got %q", kit)
	}
}

func TestAdminSessionRoundTrip(t *testing.T) {
	m := NewAdminSessionManager(testKey)
	tok, err := m.IssueAdmin("a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	email, err := m.ParseAdmin(tok)
	if err != nil {
		t.Fatal(err)
	}
	if email != "a@example.com" {
		t.Fatalf("got %q", email)
	}
}

// Both managers share SESSION_KEY, so the typ claim is the only thing
// stopping one kind of token being accepted as the other.
func TestSessionTypesAreNotInterchangeable(t *testing.T) {
	members := NewSessionManager(testKey)
	admins := NewAdminSessionManager(testKey)

	memberTok, _ := members.Issue("AB3CD7K")
	if _, err := admins.ParseAdmin(memberTok); err == nil {
		t.Fatal("member token accepted as an admin session")
	}
	adminTok, _ := admins.IssueAdmin("a@example.com")
	if _, err := members.Parse(adminTok); err == nil {
		t.Fatal("admin token accepted as a member session")
	}
}

func TestSessionRejectsWrongKey(t *testing.T) {
	tok, _ := NewSessionManager(testKey).Issue("AB3CD7K")
	other := NewSessionManager([]byte("ffffffffffffffffffffffffffffffff"))
	if _, err := other.Parse(tok); err == nil {
		t.Fatal("token signed with a different key was accepted")
	}
}

func TestSessionRejectsAlgNone(t *testing.T) {
	claims := memberClaims{KitID: "AB3CD7K", Type: memberTokenType, RegisteredClaims: jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewSessionManager(testKey).Parse(tok); err == nil {
		t.Fatal("unsigned (alg=none) token was accepted")
	}
}

func TestSessionRejectsExpired(t *testing.T) {
	claims := adminClaims{Email: "a@example.com", Type: adminTokenType, RegisteredClaims: jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(time.Now().Add(-10 * time.Hour)),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
	}}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(testKey)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewAdminSessionManager(testKey).ParseAdmin(tok); err == nil {
		t.Fatal("expired admin token was accepted")
	}
}

func TestTOTPRoundTrip(t *testing.T) {
	secret, url, err := GenerateTOTP("Medical Vault", "AB3CD7K")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(url, "otpauth://totp/") || !strings.Contains(url, "AB3CD7K") {
		t.Fatalf("unexpected otpauth URL %q", url)
	}
	code, err := totp.GenerateCode(secret, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyTOTP(secret, code) {
		t.Fatal("current code rejected")
	}
	old, _ := totp.GenerateCode(secret, time.Now().Add(-5*time.Minute))
	if old != code && VerifyTOTP(secret, old) {
		t.Fatal("code from 5 minutes ago accepted")
	}
	if VerifyTOTP(secret, "not-a-code") {
		t.Fatal("garbage code accepted")
	}
}
