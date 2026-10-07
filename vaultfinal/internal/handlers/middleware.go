package handlers

import (
	"context"
	"errors"
	"net/http"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/store"
)

// ctxKey is an unexported type for context keys, so this package's context
// values can never collide with another package's (the standard Go idiom
// for context keys).
type ctxKey int

const (
	ctxKeyKitID ctxKey = iota
	ctxKeyAdminEmail
)

// RequireSession wraps next so it only runs for requests carrying a valid
// member session cookie; otherwise it writes the one generic 401 (see
// genericError) and never calls next. On success, the authenticated KIT ID
// is stashed in the request context for next to read via kitIDFromContext —
// this is also what makes every downstream record query scoped correctly
// (invariant #5): handlers never take a KIT ID from a request parameter,
// only from the verified session.
func (s *Server) RequireSession(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(auth.MemberSessionCookieName)
		if err != nil {
			genericError(w)
			return
		}
		kitID, err := s.Sessions.Parse(cookie.Value)
		if err != nil {
			genericError(w)
			return
		}
		ctx := context.WithValue(r.Context(), ctxKeyKitID, kitID)
		next(w, r.WithContext(ctx))
	}
}

// RequireAdminSession is RequireSession's admin equivalent, stashing the
// authenticated admin's email for handlers and audit logging.
//
// Unlike member sessions, a valid admin JWT is not enough on its own: the
// admin row is re-read on every request and must still exist, be active
// and hold a permitted role (adminAllowed). That makes disabling an admin
// (admins.active = false) revoke their existing sessions immediately
// instead of leaving them valid for up to the 8h token lifetime. The cost
// is one lookup on the unique email index per admin request.
func (s *Server) RequireAdminSession(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(auth.AdminSessionCookieName)
		if err != nil {
			genericError(w)
			return
		}
		email, err := s.AdminSessions.ParseAdmin(cookie.Value)
		if err != nil {
			genericError(w)
			return
		}

		admin, err := s.Store.GetAdminByEmail(r.Context(), email)
		if errors.Is(err, store.ErrNotFound) {
			s.rejectAdminSession(w, r, email, "unknown_admin")
			return
		}
		if err != nil {
			serverError(w)
			return
		}
		if reason, ok := adminAllowed(admin); !ok {
			s.rejectAdminSession(w, r, email, reason)
			return
		}

		ctx := context.WithValue(r.Context(), ctxKeyAdminEmail, email)
		next(w, r.WithContext(ctx))
	}
}

// rejectAdminSession handles a correctly signed admin JWT whose account
// may no longer act: it audits the attempt, clears the now-useless cookie
// and returns the generic 401.
func (s *Server) rejectAdminSession(w http.ResponseWriter, r *http.Request, email, reason string) {
	s.auditFailure(r, email, "admin_session", reason)
	s.AdminSessions.ClearAdminCookie(w)
	genericError(w)
}

// kitIDFromContext reads the KIT ID stashed by RequireSession. It's only
// ever called from within a handler wrapped by RequireSession, so the
// second return value is not checked by callers — a missing value here
// would be a wiring bug, not a runtime condition to handle gracefully.
func kitIDFromContext(ctx context.Context) string {
	kitID, _ := ctx.Value(ctxKeyKitID).(string)
	return kitID
}

// adminEmailFromContext reads the admin email stashed by
// RequireAdminSession.
func adminEmailFromContext(ctx context.Context) string {
	email, _ := ctx.Value(ctxKeyAdminEmail).(string)
	return email
}
