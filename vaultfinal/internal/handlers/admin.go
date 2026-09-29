package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/ingestion"
	"vaultfinal/internal/store"
)

// maxProvisionBatchCount bounds how many members one /api/admin/provision
// request can create. Each member costs a KIT ID insert-and-retry loop plus
// 3 bcrypt hashes (bcrypt is deliberately slow) — this caps how much work
// one request can force onto the server, not how big a real cohort can be
// (an admin just issues multiple requests for a bigger cohort).
const maxProvisionBatchCount = 200

// kitIDGenerationRetries caps how many times provisionOneMember retries
// after a KIT ID collision before giving up and failing the whole request.
// A collision on a 7-character, 31-symbol-alphabet ID is already rare; this
// many retries in a row failing would indicate something is actually wrong
// (e.g. the members table is unexpectedly huge, or the RNG is broken)
// rather than ordinary bad luck.
const kitIDGenerationRetries = 5

// maxRecoveryKeyTopUp bounds how many fresh recovery keys one
// /api/admin/members/{kitId}/recovery-keys request can mint, for the same
// reason maxProvisionBatchCount exists — bcrypt hashing cost.
const maxRecoveryKeyTopUp = 10

type provisionRequest struct {
	Count int `json:"count"`
}

type provisionedMember struct {
	KitID        string   `json:"kitId"`
	RecoveryKeys []string `json:"recoveryKeys"`
}

// Provision creates N members in one request — see claude.md's "Batch
// provisioning" section for why this is a batch endpoint rather than
// one-call-per-member: a real onboarding workflow hands over a cohort at
// once. members is nested under a key (not a bare array) so batch-level
// metadata can be added to the response later without changing its shape.
func (s *Server) Provision(w http.ResponseWriter, r *http.Request) {
	var req provisionRequest
	if err := decodeJSON(w, r, &req); err != nil || req.Count < 1 || req.Count > maxProvisionBatchCount {
		badRequest(w, "count must be an integer between 1 and 200")
		return
	}

	ctx := r.Context()
	adminEmail := adminEmailFromContext(ctx)

	members := make([]provisionedMember, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		kitID, keys, err := s.provisionOneMember(ctx)
		if err != nil {
			// Each member is an independent row with no cross-member
			// invariant, so we deliberately don't wrap this loop in a
			// transaction. On a hard failure partway through, we stop and
			// leave whichever members already committed in place — they're
			// valid rows with valid audit entries; the admin just
			// re-requests the remainder.
			serverError(w)
			return
		}
		members = append(members, provisionedMember{KitID: kitID, RecoveryKeys: keys})
		// One audit row per member (not one summary row for the whole
		// batch) so the audit trail shows exactly which KIT IDs came from
		// which admin — a batch just reads as N rows with close timestamps.
		adminEmailCopy := adminEmail
		_ = s.Store.LogAudit(ctx, kitID, "member_provisioned", clientIP(r), nil, &adminEmailCopy)
	}

	writeJSON(w, http.StatusCreated, map[string]any{"members": members})
}

// provisionOneMember generates a KIT ID (retrying on collision), then
// generates and stores its 3 recovery keys (1 signup + 2 recovery). Factored
// out of Provision so the batch loop is just "call this N times."
func (s *Server) provisionOneMember(ctx context.Context) (kitID string, plaintextKeys []string, err error) {
	for attempt := 0; ; attempt++ {
		candidate, err := auth.GenerateKitID()
		if err != nil {
			return "", nil, err
		}
		err = s.Store.InsertMember(ctx, candidate)
		if err == nil {
			kitID = candidate
			break
		}
		if errors.Is(err, store.ErrDuplicateKitID) && attempt < kitIDGenerationRetries {
			continue
		}
		return "", nil, err
	}

	signupKeys, err := auth.GenerateRecoveryKeys(auth.RecoveryPurposeSignup, 1)
	if err != nil {
		return "", nil, err
	}
	recoveryKeys, err := auth.GenerateRecoveryKeys(auth.RecoveryPurposeRecovery, 2)
	if err != nil {
		return "", nil, err
	}

	if err := s.hashAndStoreRecoveryKeys(ctx, kitID, auth.RecoveryPurposeSignup, signupKeys); err != nil {
		return "", nil, err
	}
	if err := s.hashAndStoreRecoveryKeys(ctx, kitID, auth.RecoveryPurposeRecovery, recoveryKeys); err != nil {
		return "", nil, err
	}

	return kitID, append(signupKeys, recoveryKeys...), nil
}

// hashAndStoreRecoveryKeys bcrypt-hashes each plaintext key and inserts the
// hashes in one batch — shared by provisionOneMember and TopUpRecoveryKeys.
func (s *Server) hashAndStoreRecoveryKeys(ctx context.Context, kitID, purpose string, plaintextKeys []string) error {
	hashes := make([]string, len(plaintextKeys))
	for i, k := range plaintextKeys {
		h, err := auth.HashRecoveryKey(k)
		if err != nil {
			return err
		}
		hashes[i] = h
	}
	return s.Store.InsertRecoveryKeys(ctx, kitID, purpose, hashes)
}

type topUpRecoveryKeysRequest struct {
	Count int `json:"count"`
}

// TopUpRecoveryKeys mints fresh recovery-purpose keys for a member who has
// used up their original 2 (lost their device twice). It NEVER mints a
// signup-purpose key — that stays a one-time-per-member thing by design
// (see claude.md's "Recovery keys have a purpose" section) — so a member
// who somehow still needed first-enrollment access couldn't get it from
// this endpoint even if an admin tried.
func (s *Server) TopUpRecoveryKeys(w http.ResponseWriter, r *http.Request) {
	kitID := r.PathValue("kitId")

	var req topUpRecoveryKeysRequest
	if err := decodeJSON(w, r, &req); err != nil || req.Count < 1 || req.Count > maxRecoveryKeyTopUp {
		badRequest(w, "count must be an integer between 1 and 10")
		return
	}

	ctx := r.Context()
	if _, err := s.Store.GetMember(ctx, kitID); errors.Is(err, store.ErrNotFound) {
		notFound(w)
		return
	} else if err != nil {
		serverError(w)
		return
	}

	keys, err := auth.GenerateRecoveryKeys(auth.RecoveryPurposeRecovery, req.Count)
	if err != nil {
		serverError(w)
		return
	}
	if err := s.hashAndStoreRecoveryKeys(ctx, kitID, auth.RecoveryPurposeRecovery, keys); err != nil {
		serverError(w)
		return
	}

	adminEmail := adminEmailFromContext(ctx)
	_ = s.Store.LogAudit(ctx, kitID, "recovery_keys_topped_up", clientIP(r), map[string]any{"count": req.Count}, &adminEmail)
	writeJSON(w, http.StatusCreated, provisionedMember{KitID: kitID, RecoveryKeys: keys})
}

// Ingest accepts one CSV for one KIT ID, encrypts each row independently,
// and stores it. multipart/form-data is used (not JSON) because the
// payload is a file — kitId is a form field alongside it.
func (s *Server) Ingest(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, ingestion.MaxCSVUploadBytes)
	if err := r.ParseMultipartForm(ingestion.MaxCSVUploadBytes); err != nil {
		badRequest(w, "request too large or not valid multipart/form-data")
		return
	}

	kitID := r.FormValue("kitId")
	if kitID == "" {
		badRequest(w, "kitId is required")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		badRequest(w, "file is required")
		return
	}
	defer file.Close()

	// The mis-link guard: an admin pasting the wrong file into the wrong
	// request can't silently attach it to a different member.
	if !ingestion.FilenameMatchesKitID(header.Filename, kitID) {
		badRequest(w, "filename must be <kitId>.csv and match the kitId field")
		return
	}

	ctx := r.Context()
	if _, err := s.Store.GetMember(ctx, kitID); errors.Is(err, store.ErrNotFound) {
		notFound(w)
		return
	} else if err != nil {
		serverError(w)
		return
	}

	rows, err := ingestion.ProcessCSV(file)
	if err != nil {
		badRequest(w, "could not parse CSV")
		return
	}

	batchID := uuid.New()
	adminEmail := adminEmailFromContext(ctx)

	for i, fields := range rows {
		blob, err := ingestion.EncodeRow(fields)
		if err != nil {
			serverError(w)
			return
		}
		enc, err := s.Crypto.Encrypt(ctx, blob)
		if err != nil {
			serverError(w)
			return
		}
		// Same reasoning as Provision's partial-failure comment: rows
		// already inserted stay inserted on a mid-batch failure; the admin
		// re-uploads rather than us reconciling a half-applied transaction.
		if err := s.Store.InsertMedicalRecord(ctx, kitID, enc, i, batchID); err != nil {
			serverError(w)
			return
		}
	}

	if err := s.Store.InsertIngestionBatch(ctx, store.IngestionBatch{
		ID:         batchID,
		MemberID:   kitID,
		UploadedBy: adminEmail,
		Filename:   header.Filename,
		RowCount:   len(rows),
		Status:     "completed",
	}); err != nil {
		serverError(w)
		return
	}

	_ = s.Store.LogAudit(ctx, kitID, "ingest", clientIP(r), map[string]any{"rowCount": len(rows), "filename": header.Filename}, &adminEmail)
	writeJSON(w, http.StatusCreated, map[string]any{
		"batchId":  batchID.String(),
		"rowCount": len(rows),
	})
}
