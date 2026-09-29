package handlers

import (
	"errors"
	"net/http"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/store"
)

type loginRequest struct {
	KitID string `json:"kitId"`
	Code  string `json:"code"`
}

// Login authenticates an already-registered member by KIT ID + current
// TOTP code. Every failure path — unknown KIT ID, not yet registered, or
// wrong code — returns the same genericError (invariant #6), so an
// attacker probing KIT IDs learns nothing from the response.
func (s *Server) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req); err != nil || req.KitID == "" || req.Code == "" {
		badRequest(w, "kitId and code are required")
		return
	}

	ctx := r.Context()
	member, err := s.Store.GetMember(ctx, req.KitID)
	if errors.Is(err, store.ErrNotFound) {
		genericError(w)
		return
	}
	if err != nil {
		serverError(w)
		return
	}
	if !member.Registered || member.TOTPSecretEnc == nil {
		genericError(w)
		return
	}

	secretPlain, err := s.Crypto.Decrypt(ctx, member.TOTPSecretEnc)
	if err != nil {
		serverError(w)
		return
	}
	if !auth.VerifyTOTP(string(secretPlain), req.Code) {
		genericError(w)
		return
	}

	token, err := s.Sessions.Issue(req.KitID)
	if err != nil {
		serverError(w)
		return
	}
	s.Sessions.SetCookie(w, token)

	_ = s.Store.LogAudit(ctx, req.KitID, "login", clientIP(r), nil, nil)
	writeJSON(w, http.StatusOK, sessionResponse{KitID: req.KitID})
}

type recoveryRequest struct {
	KitID       string `json:"kitId"`
	RecoveryKey string `json:"recoveryKey"`
}

// Recovery handles a lost device: it accepts ONLY unused recovery-purpose
// keys (invariant #4) and is self-contained — it directly generates and
// stores a brand new TOTP secret and returns the otpauth URL, the same
// response shape OnboardBegin returns. It deliberately does NOT reset
// registered=false and redirect to /onboard/begin: no signup-purpose key
// ever survives past first enrollment, so that endpoint would just reject
// the member. See beginEnrollment's doc comment for the shared logic.
func (s *Server) Recovery(w http.ResponseWriter, r *http.Request) {
	var req recoveryRequest
	if err := decodeJSON(w, r, &req); err != nil || req.KitID == "" || req.RecoveryKey == "" {
		badRequest(w, "kitId and recoveryKey are required")
		return
	}

	ctx := r.Context()
	keys, err := s.Store.GetUnusedRecoveryKeys(ctx, req.KitID, auth.RecoveryPurposeRecovery)
	if err != nil {
		serverError(w)
		return
	}
	matched, ok := matchRecoveryKey(keys, req.RecoveryKey)
	if !ok {
		genericError(w)
		return
	}
	if err := s.Store.MarkRecoveryKeyUsed(ctx, matched.ID); err != nil {
		serverError(w)
		return
	}

	otpauthURL, err := s.beginEnrollment(ctx, req.KitID)
	if err != nil {
		serverError(w)
		return
	}

	_ = s.Store.LogAudit(ctx, req.KitID, "recovery", clientIP(r), nil, nil)
	writeJSON(w, http.StatusOK, onboardBeginResponse{OtpauthURL: otpauthURL})
}

// Logout clears the member session cookie. No session is required to call
// it — logging out an already-logged-out browser is a no-op, not an error.
func (s *Server) Logout(w http.ResponseWriter, r *http.Request) {
	s.Sessions.ClearCookie(w)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Me returns the authenticated member's own KIT ID — the minimal
// "who am I" endpoint a frontend needs after login, and nothing more
// (there is no other identifying data to return).
func (s *Server) Me(w http.ResponseWriter, r *http.Request) {
	kitID := kitIDFromContext(r.Context())
	writeJSON(w, http.StatusOK, sessionResponse{KitID: kitID})
}
