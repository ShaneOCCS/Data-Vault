package handlers

import (
	"context"
	"errors"
	"net/http"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/store"
)

// beginEnrollment generates a fresh TOTP secret for kitID, encrypts it, and
// stores it — this is the exact "generate secret → encrypt → store → build
// otpauth URL" sequence claude.md says must be shared between OnboardBegin
// (first enrollment) and Recovery (lost-device re-enrollment) rather than
// duplicated, since both flows end at the identical next step: the member
// scans a QR and calls OnboardComplete.
func (s *Server) beginEnrollment(ctx context.Context, kitID string) (otpauthURL string, err error) {
	secret, url, err := auth.GenerateTOTP(s.Config.TOTPIssuer, kitID)
	if err != nil {
		return "", err
	}
	secretEnc, err := s.Crypto.Encrypt(ctx, []byte(secret))
	if err != nil {
		return "", err
	}
	if err := s.Store.SetMemberTOTPSecret(ctx, kitID, secretEnc); err != nil {
		return "", err
	}
	return url, nil
}

type onboardBeginRequest struct {
	KitID       string `json:"kitId"`
	RecoveryKey string `json:"recoveryKey"`
}

type onboardBeginResponse struct {
	OtpauthURL string `json:"otpauthUrl"`
}

// OnboardBegin redeems a signup-purpose recovery key and starts first-ever
// enrollment for a member. It accepts ONLY unused signup-purpose keys
// (invariant #4) — a recovery-purpose key here fails the same generic way
// as any other wrong credential.
func (s *Server) OnboardBegin(w http.ResponseWriter, r *http.Request) {
	var req onboardBeginRequest
	if err := decodeJSON(w, r, &req); err != nil || req.KitID == "" || req.RecoveryKey == "" {
		badRequest(w, "kitId and recoveryKey are required")
		return
	}

	ctx := r.Context()
	keys, err := s.Store.GetUnusedRecoveryKeys(ctx, req.KitID, auth.RecoveryPurposeSignup)
	if err != nil {
		serverError(w)
		return
	}

	matched, ok := matchRecoveryKey(keys, req.RecoveryKey)
	if !ok {
		// Unknown KIT ID and "right KIT ID, wrong/used/wrong-purpose key"
		// land here identically — invariant #6.
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

	_ = s.Store.LogAudit(ctx, req.KitID, "onboard_begin", clientIP(r), nil, nil)
	writeJSON(w, http.StatusOK, onboardBeginResponse{OtpauthURL: otpauthURL})
}

type onboardCompleteRequest struct {
	KitID string `json:"kitId"`
	Code  string `json:"code"`
}

type sessionResponse struct {
	KitID string `json:"kitId"`
}

// OnboardComplete finishes either first-time enrollment or lost-device
// recovery — the two flows converge here because both end with "there's a
// pending (unconfirmed) TOTP secret on the member row; does this code match
// it." A correct code proves the member's authenticator app now holds the
// right secret, at which point we mark them registered and start a session.
func (s *Server) OnboardComplete(w http.ResponseWriter, r *http.Request) {
	var req onboardCompleteRequest
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
	if member.TOTPSecretEnc == nil {
		genericError(w) // no pending secret — nothing to confirm
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

	if err := s.Store.MarkMemberRegistered(ctx, req.KitID); err != nil {
		serverError(w)
		return
	}

	token, err := s.Sessions.Issue(req.KitID)
	if err != nil {
		serverError(w)
		return
	}
	s.Sessions.SetCookie(w, token)

	_ = s.Store.LogAudit(ctx, req.KitID, "onboard_complete", clientIP(r), nil, nil)
	writeJSON(w, http.StatusOK, sessionResponse{KitID: req.KitID})
}

// matchRecoveryKey bcrypt-compares plaintext against every candidate key's
// hash and returns the first match. Shared by OnboardBegin and Recovery so
// the "try each unused key of the right purpose" loop exists once.
func matchRecoveryKey(candidates []store.RecoveryKey, plaintext string) (store.RecoveryKey, bool) {
	for _, k := range candidates {
		if auth.CompareRecoveryKey(k.CodeHash, plaintext) {
			return k, true
		}
	}
	return store.RecoveryKey{}, false
}
