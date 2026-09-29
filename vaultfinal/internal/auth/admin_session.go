package auth

import (
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AdminSessionCookieName is the cookie a signed-in admin's browser holds.
// It's a distinct cookie from MemberSessionCookieName so a browser can hold
// both a member and an admin session at once without collision, and so
// clearing one never touches the other.
const AdminSessionCookieName = "vault_admin_session"

const adminSessionTTL = 8 * time.Hour // shorter than a member session — admin sessions can provision/ingest, so a stolen one is worth more

const adminTokenType = "admin"

// adminClaims is the JWT payload for a signed-in admin. Email identifies
// the admin for the audit_log's actor_admin_email column.
type adminClaims struct {
	Email string `json:"email"`
	Type  string `json:"typ"`
	jwt.RegisteredClaims
}

// AdminSessionManager issues and validates admin session JWTs, structurally
// identical in shape to SessionManager but kept as a separate type so
// member and admin sessions can never be confused for one another at a
// Go-type level, not just by convention.
type AdminSessionManager struct {
	key []byte
}

// NewAdminSessionManager builds an AdminSessionManager from the app's
// SESSION_KEY — the same key SessionManager uses. Sharing the signing key
// is safe because each manager only accepts its own claim shape and Type
// value; it would NOT be safe to also share a cookie name or claim
// struct, since then a member token would parse successfully as an admin
// token with an empty Email.
func NewAdminSessionManager(key []byte) *AdminSessionManager {
	return &AdminSessionManager{key: key}
}

// IssueAdmin signs a new admin session JWT for the given admin email.
func (m *AdminSessionManager) IssueAdmin(email string) (string, error) {
	now := time.Now()
	claims := adminClaims{
		Email: email,
		Type:  adminTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(adminSessionTTL)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.key)
	if err != nil {
		return "", fmt.Errorf("auth: sign admin session: %w", err)
	}
	return signed, nil
}

// ParseAdmin validates an admin session JWT and returns the admin's email.
func (m *AdminSessionManager) ParseAdmin(tokenString string) (email string, err error) {
	claims := &adminClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return m.key, nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("auth: invalid admin session token")
	}
	if claims.Type != adminTokenType {
		return "", fmt.Errorf("auth: wrong token type")
	}
	return claims.Email, nil
}

// SetAdminCookie writes the admin session cookie with the same hardened
// flags as the member cookie (see session.go's SetCookie comment).
func (m *AdminSessionManager) SetAdminCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     AdminSessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(adminSessionTTL.Seconds()),
	})
}

// ClearAdminCookie overwrites the admin session cookie with an
// already-expired one.
func (m *AdminSessionManager) ClearAdminCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     AdminSessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}
