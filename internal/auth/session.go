package auth

import (
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// MemberSessionCookieName is the cookie a signed-in member's browser holds.
// Exported so the handlers/middleware package can read it without this
// package needing to know anything about HTTP routing.
const MemberSessionCookieName = "vault_session"

const memberSessionTTL = 12 * time.Hour

// memberTokenType tags every member JWT so it can never be accepted by the
// admin session manager even though both are signed with the same
// SESSION_KEY (see config.go's comment on SESSION_KEY) — the two managers
// parse into different claim shapes AND check this field, so a member
// token replayed at an admin-only endpoint is rejected on the type check
// alone, before any admin-specific field is even read.
const memberTokenType = "member"

// memberClaims is the JWT payload for a signed-in member. It carries only
// the KIT ID — deliberately nothing else, since the whole point of KIT-ID
// pseudonymization is that no identifying data should exist to leak out of
// a decoded token.
type memberClaims struct {
	KitID string `json:"kitId"`
	Type  string `json:"typ"`
	jwt.RegisteredClaims
}

// SessionManager issues and validates member session JWTs and manages the
// cookie that carries them.
type SessionManager struct {
	key []byte
}

// NewSessionManager builds a SessionManager from the app's SESSION_KEY.
func NewSessionManager(key []byte) *SessionManager {
	return &SessionManager{key: key}
}

// Issue signs a new member session JWT for kitID.
func (m *SessionManager) Issue(kitID string) (string, error) {
	now := time.Now()
	claims := memberClaims{
		KitID: kitID,
		Type:  memberTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(memberSessionTTL)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.key)
	if err != nil {
		return "", fmt.Errorf("auth: sign member session: %w", err)
	}
	return signed, nil
}

// Parse validates a member session JWT and returns the KIT ID it carries.
// It rejects tokens signed with an unexpected algorithm (a standard JWT
// hardening step — never trust the algorithm named in the token itself)
// and tokens whose Type isn't "member", which is what stops an admin
// session token from being replayed here even though both share a signing
// key.
func (m *SessionManager) Parse(tokenString string) (kitID string, err error) {
	claims := &memberClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return m.key, nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("auth: invalid member session token")
	}
	if claims.Type != memberTokenType {
		return "", fmt.Errorf("auth: wrong token type")
	}
	return claims.KitID, nil
}

// SetCookie writes the member session cookie. HttpOnly (unreachable from
// JS, so XSS can't steal it), Secure (never sent over plain HTTP), and
// SameSite=Lax (survives normal top-level navigation but blocks the
// cookie being attached to cross-site POSTs) is the standard hardened
// combination for a session cookie.
func (m *SessionManager) SetCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     MemberSessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(memberSessionTTL.Seconds()),
	})
}

// ClearCookie overwrites the member session cookie with an already-expired
// one, which is how a browser is told to delete a cookie.
func (m *SessionManager) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     MemberSessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}
