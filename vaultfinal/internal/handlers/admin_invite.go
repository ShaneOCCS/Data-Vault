package handlers

import (
	"net/http"
	"time"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/store"
)

// inviteTTL bounds how long an admin invite link stays valid — unlike
// recovery keys (which never expire on their own, only get used up),
// invites are time-limited per claude.md's admin_invites schema notes.
const inviteTTL = 72 * time.Hour

type createInviteRequest struct {
	Email string `json:"email"`
}

type createInviteResponse struct {
	Email     string `json:"email"`
	Token     string `json:"token"`
	ExpiresAt string `json:"expiresAt"`
}

// CreateInvite lets a logged-in admin invite the next admin by email. The
// plaintext token is returned exactly once, in this response — only its
// bcrypt hash is ever stored (mirrors how recovery keys and the invite
// token itself are handled everywhere else in this system).
func (s *Server) CreateInvite(w http.ResponseWriter, r *http.Request) {
	var req createInviteRequest
	if err := decodeJSON(w, r, &req); err != nil || req.Email == "" {
		badRequest(w, "email is required")
		return
	}

	token, err := auth.GenerateInviteToken()
	if err != nil {
		serverError(w)
		return
	}
	tokenHash, err := auth.HashInviteToken(token)
	if err != nil {
		serverError(w)
		return
	}

	invitedBy := adminEmailFromContext(r.Context())
	expiresAt := time.Now().Add(inviteTTL)

	ctx := r.Context()
	if err := s.Store.InsertAdminInvite(ctx, req.Email, tokenHash, invitedBy, expiresAt); err != nil {
		serverError(w)
		return
	}

	invitedByCopy := invitedBy
	_ = s.Store.LogAudit(ctx, req.Email, "admin_invite_created", clientIP(r), map[string]any{"invitedBy": invitedBy}, &invitedByCopy)
	writeJSON(w, http.StatusCreated, createInviteResponse{
		Email:     req.Email,
		Token:     token,
		ExpiresAt: expiresAt.Format(timeFormat),
	})
}

type acceptInviteRequest struct {
	Email    string `json:"email"`
	Token    string `json:"token"`
	Password string `json:"password"`
}

// AcceptInvite redeems an unused, unexpired invite and creates the new
// admin account. This — plus cmd/bootstrap-admin — are the ONLY two ways an
// admin account is ever created in this system (invariant #9); there is no
// standing "create admin" endpoint that doesn't require an existing valid
// invite.
func (s *Server) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	var req acceptInviteRequest
	if err := decodeJSON(w, r, &req); err != nil || req.Email == "" || req.Token == "" || req.Password == "" {
		badRequest(w, "email, token, and password are required")
		return
	}

	ctx := r.Context()
	invites, err := s.Store.GetPendingInvitesByEmail(ctx, req.Email)
	if err != nil {
		serverError(w)
		return
	}
	matched, ok := matchInviteToken(invites, req.Token)
	if !ok {
		genericError(w)
		return
	}
	if err := s.Store.MarkInviteUsed(ctx, matched.ID); err != nil {
		serverError(w)
		return
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		serverError(w)
		return
	}
	if err := s.Store.InsertAdmin(ctx, req.Email, passwordHash); err != nil {
		serverError(w)
		return
	}

	token, err := s.AdminSessions.IssueAdmin(req.Email)
	if err != nil {
		serverError(w)
		return
	}
	s.AdminSessions.SetAdminCookie(w, token)

	_ = s.Store.LogAudit(ctx, req.Email, "admin_invite_accepted", clientIP(r), nil, nil)
	writeJSON(w, http.StatusOK, adminSessionResponse{Email: req.Email})
}

// matchInviteToken bcrypt-compares plaintext against every candidate
// invite's hash and returns the first match — mirrors matchRecoveryKey in
// onboard.go for the same reason: a handful of candidates, checked in a
// cheap loop rather than looked up by hash (bcrypt hashes aren't
// deterministic, so they can't be indexed/queried directly).
func matchInviteToken(candidates []store.AdminInvite, plaintext string) (store.AdminInvite, bool) {
	for _, inv := range candidates {
		if auth.CompareInviteToken(inv.TokenHash, plaintext) {
			return inv, true
		}
	}
	return store.AdminInvite{}, false
}
