// Package handlers wires HTTP requests to the auth/store/crypto layers.
// Per claude.md's "Architecture" section, handlers decide *what* happens
// and delegate *how* — there is no SQL here (that's store's job, invariant
// #7) and no direct crypto primitive use beyond calling the shared
// Encryptor interface.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/config"
	"vaultfinal/internal/crypto"
	"vaultfinal/internal/ratelimit"
	"vaultfinal/internal/store"
)

// Server holds every dependency a handler might need. One Server is built
// in cmd/server/main.go and its methods are registered as routes — nothing
// here is a package-level global, which keeps the whole app testable
// against a fake store/encryptor if needed later.
type Server struct {
	Store         *store.Store
	Crypto        crypto.Encryptor
	Sessions      *auth.SessionManager
	AdminSessions *auth.AdminSessionManager
	Config        *config.Config

	// credentialLimiter throttles every endpoint that checks a secret
	// (password, TOTP code, recovery key, invite token) by source IP. One
	// shared limiter is intentional: an attacker rotating which endpoint
	// they hammer from the same IP shouldn't get a fresh budget per
	// endpoint.
	credentialLimiter *ratelimit.Limiter
}

// NewServer builds a Server and its rate limiter. perMinute/burst are
// forwarded straight to ratelimit.New — see claude.md's "Rate limiting"
// section for why the exact numbers are a secondary concern to having a
// limiter at all.
func NewServer(st *store.Store, enc crypto.Encryptor, sessions *auth.SessionManager, adminSessions *auth.AdminSessionManager, cfg *config.Config) *Server {
	return &Server{
		Store:             st,
		Crypto:            enc,
		Sessions:          sessions,
		AdminSessions:     adminSessions,
		Config:            cfg,
		credentialLimiter: ratelimit.New(10, 5), // 10/min steady state, burst of 5 — conservative on purpose
	}
}

// Routes builds the full HTTP router. Uses Go 1.22's stdlib method+pattern
// mux (net/http.ServeMux) — see claude.md's tech stack rationale: this
// system's endpoint count doesn't justify a framework dependency.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	limit := s.credentialLimiter.Middleware

	// --- admin auth & invites ---
	mux.HandleFunc("POST /api/admin/auth/login", limit(s.AdminLogin))
	mux.HandleFunc("POST /api/admin/auth/logout", s.RequireAdminSession(s.AdminLogout))
	mux.HandleFunc("POST /api/admin/invites", s.RequireAdminSession(s.CreateInvite))
	mux.HandleFunc("POST /api/admin/invites/accept", limit(s.AcceptInvite))
	mux.HandleFunc("POST /api/admin/profile", s.RequireAdminSession(s.UpdateProfile))
	mux.HandleFunc("DELETE /api/admin/admins/{email}", s.RequireAdminSession(s.DeleteAdmin))
	mux.HandleFunc("GET /api/admin/admins", s.RequireAdminSession(s.ListAdmins))

	// --- admin member management ---
	mux.HandleFunc("POST /api/admin/provision", s.RequireAdminSession(s.Provision))
	mux.HandleFunc("POST /api/admin/members/{kitId}/recovery-keys", s.RequireAdminSession(s.TopUpRecoveryKeys))
	mux.HandleFunc("GET /api/admin/members", s.RequireAdminSession(s.ListMembers))
	mux.HandleFunc("POST /api/admin/ingest", s.RequireAdminSession(s.Ingest))

	// --- member onboarding & auth ---
	mux.HandleFunc("POST /api/onboard/begin", limit(s.OnboardBegin))
	mux.HandleFunc("POST /api/onboard/complete", limit(s.OnboardComplete))
	mux.HandleFunc("POST /api/auth/login", limit(s.Login))
	mux.HandleFunc("POST /api/auth/recovery", limit(s.Recovery))
	mux.HandleFunc("POST /api/auth/logout", s.Logout)
	mux.HandleFunc("GET /api/session/me", s.RequireSession(s.Me))

	// --- member records ---
	mux.HandleFunc("GET /api/records", s.RequireSession(s.ListRecords))
	mux.HandleFunc("GET /api/records/{id}", s.RequireSession(s.GetRecord))

	return s.CORS(mux)
}

// writeJSON encodes v as the JSON response body with the given status code.
// Every handler response goes through this so the Content-Type header and
// encoding behavior are consistent in one place.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// badRequest writes a 400 with a specific, safe-to-show message. Only use
// this for input validation problems (missing field, bad JSON) — never for
// anything that reveals whether a credential was correct (that's
// genericError).
func badRequest(w http.ResponseWriter, message string) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": message})
}

// genericError writes one fixed 401 body regardless of the real reason,
// per invariant #6: unknown KIT ID, wrong TOTP code, unregistered member,
// and wrong-purpose recovery key must all look identical to the caller, or
// the response itself becomes an enumeration oracle.
func genericError(w http.ResponseWriter) {
	writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
}

// notFound writes the one shared 404 body used for both "no such record"
// and "that record belongs to someone else" (invariant #5).
func notFound(w http.ResponseWriter) {
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

// serverError writes a generic 500 — never include err.Error() in the
// response body, since store/crypto errors can embed details (a DSN
// fragment, a raw driver message) that shouldn't reach a client.
func serverError(w http.ResponseWriter) {
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
}

// audit writes one audit_log row for r. It stays best-effort — a failed
// audit write never fails the request it describes (by then the action
// has already happened; failing the response would only hide its result,
// e.g. a provision batch's one-time plaintext keys) — but a failure is no
// longer silent: it's written to the process log (journald on EC2) so a
// broken audit trail gets noticed.
//
// The write uses a context that isn't canceled when the client disconnects,
// so a caller dropping the connection right after a credential attempt
// can't also drop that attempt's audit row.
func (s *Server) audit(r *http.Request, principal, eventType string, detail map[string]any, actorAdminEmail *string) {
	ctx := context.WithoutCancel(r.Context())
	if err := s.Store.LogAudit(ctx, principal, eventType, clientIP(r), detail, actorAdminEmail); err != nil {
		log.Printf("audit: failed to write %q event: %v", eventType, err)
	}
}

// auditFailure records a rejected credential attempt as "<eventType>_failed"
// with an internal-only reason. The reason exists only in audit_log — the
// client still gets the one genericError (invariant #6) — so an operator
// can tell a member mistyping a code from someone probing KIT IDs.
// principal is whatever the caller submitted (KIT ID or email), which may
// not exist; store.LogAudit truncates it to fit the column.
func (s *Server) auditFailure(r *http.Request, principal, eventType, reason string) {
	s.audit(r, principal, eventType+"_failed", map[string]any{"reason": reason}, nil)
}

// clientIP extracts the caller's address for audit logging and record
// access logging. It trusts X-Forwarded-For because, per claude.md's
// deployment section, the only thing that can ever reach this process is
// the nginx reverse proxy on the same box — the app's own port is never
// exposed to the internet — and nginx is configured to set that header.
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		first, _, _ := strings.Cut(fwd, ",")
		return strings.TrimSpace(first)
	}
	// SplitHostPort (not "cut at the last colon") so an IPv6 RemoteAddr like
	// "[::1]:5555" yields "::1" — the brackets would make the audit_log
	// insert fail, since ip_address is an inet column.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// decodeJSON reads and JSON-decodes the request body into dst, capping the
// body at 1MB -- every JSON request in this API is small (IDs, counts,
// codes); a large body here would only ever be a mistake or an abuse
// attempt.
//
// It also requires Content-Type: application/json (CORS.md section 5,
// point 2). Without this, a cross-site form POST under a Content-Type that
// never triggers a CORS preflight (text/plain,
// application/x-www-form-urlencoded, multipart/form-data) could reach this
// decoder, so the Origin check in cors.go would never get a chance to
// block it. Requiring this exact Content-Type forces a preflight on every
// real call. Callers treat a bad Content-Type the same as any other decode
// failure, via their existing badRequest(...) call.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		return fmt.Errorf("decodeJSON: Content-Type must be application/json, got %q", ct)
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
