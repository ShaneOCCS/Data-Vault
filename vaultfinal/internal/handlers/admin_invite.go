package handlers

import (
	"errors"
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
	caller, err := s.Store.GetAdminByEmail(r.Context(), adminEmailFromContext(r.Context()))
	if err != nil {
		serverError(w)
		return
	}
	if !requireSuperadmin(w, caller) {
		return
	}

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
	s.audit(r, req.Email, "admin_invite_created", map[string]any{"invitedBy": invitedBy}, &invitedByCopy)
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
	Name     string `json:"name"`
}

// AcceptInvite redeems an unused, unexpired invite and creates the new
// admin account. This — plus cmd/bootstrap-admin — are the ONLY two ways an
// admin account is ever created in this system (invariant #9); there is no
// standing "create admin" endpoint that doesn't require an existing valid
// invite.
func (s *Server) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	var req acceptInviteRequest
	if err := decodeJSON(w, r, &req); err != nil || req.Email == "" || req.Token == "" || req.Password == "" || req.Name == "" {
		badRequest(w, "email, token, password, and name are required")
		return
	}
	// Checked before the invite is even looked up, so a weak password can
	// never consume (or learn anything about) an invite.
	if err := auth.ValidateAdminPassword(req.Password); err != nil {
		badRequest(w, err.Error())
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
		s.auditFailure(r, req.Email, "admin_invite_accept", "no_matching_invite")
		genericError(w)
		return
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		serverError(w)
		return
	}
	// Claiming the invite and creating the admin happen in one transaction
	// (see store.AcceptInviteAndCreateAdmin): a concurrent accept of the
	// same token loses the claim, and a failed insert leaves the invite
	// unspent.
	err = s.Store.AcceptInviteAndCreateAdmin(ctx, matched.ID, req.Name, req.Email, passwordHash)
	if errors.Is(err, store.ErrAlreadyUsed) {
		s.auditFailure(r, req.Email, "admin_invite_accept", "invite_already_used")
		genericError(w)
		return
	}
	if errors.Is(err, store.ErrDuplicateAdminEmail) {
		// Only reachable with a valid token for this exact email, so
		// saying so tells nothing to someone without one. The invite is
		// NOT consumed.
		s.auditFailure(r, req.Email, "admin_invite_accept", "admin_exists")
		writeJSON(w, http.StatusConflict, map[string]string{"error": "an admin account with this email already exists"})
		return
	}
	if err != nil {
		serverError(w)
		return
	}

	token, err := s.AdminSessions.IssueAdmin(req.Email)
	if err != nil {
		serverError(w)
		return
	}
	s.AdminSessions.SetAdminCookie(w, token)

	s.audit(r, req.Email, "admin_invite_accepted", nil, nil)
	writeJSON(w, http.StatusOK, adminSessionResponse{Email: req.Email, Name: req.Name})
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
