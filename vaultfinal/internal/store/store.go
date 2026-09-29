// Package store is the ONLY place in this codebase that contains SQL
// (invariant #7 in claude.md). Handlers call methods here and get back
// plain structs — they never see a query, a connection, or a *pgx.Row.
// This keeps every query auditable in one file, which matters a lot for a
// system holding real patient data: reviewing "does anything leak across
// members" is a one-file read, not a codebase-wide grep.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned by any lookup that finds no matching row. Callers
// in the handlers package generally turn this into a 404 — for record
// lookups specifically, returning ErrNotFound whether a record doesn't
// exist at all or exists but belongs to someone else is what makes
// GET /records/{id} return 404 instead of 403 for other members' records
// (invariant #5): the store layer doesn't even distinguish the two cases,
// so there's no separate code path that could leak the distinction.
var ErrNotFound = errors.New("store: not found")

// ErrDuplicateKitID is returned by InsertMember when the randomly generated
// KIT ID collides with an existing one. Callers (see the admin handler's
// provisionOneMember) catch this specifically and retry with a freshly
// generated ID — collisions are expected to happen occasionally at scale
// and are not an error condition worth surfacing further up.
var ErrDuplicateKitID = errors.New("store: duplicate kit id")

// Store wraps a pgx connection pool. One Store is created at startup in
// cmd/server/main.go and shared (it's safe for concurrent use — pgxpool
// manages its own connection checkout per call) across every request.
type Store struct {
	pool *pgxpool.Pool
}

// New wraps an already-connected pgxpool.Pool. Connecting is main()'s job,
// not this package's, so store stays easy to test against a pool pointed
// at a throwaway test database.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// isUniqueViolation reports whether err is a Postgres unique_violation
// (SQLSTATE 23505), regardless of which constraint triggered it.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// =========================================================================
// members
// =========================================================================

// Member mirrors the members table. TOTPSecretEnc is nil until a member
// completes onboarding for the first time (or re-enrolls via recovery).
type Member struct {
	ID            string
	Registered    bool
	TOTPSecretEnc []byte
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// InsertMember creates a new member row with registered=false and no TOTP
// secret yet. Returns ErrDuplicateKitID on a KIT ID collision so the caller
// can retry with a new random ID — see provisionOneMember in
// internal/handlers/admin.go.
func (s *Store) InsertMember(ctx context.Context, kitID string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO members (id, registered)
		VALUES ($1, false)
	`, kitID)
	if isUniqueViolation(err) {
		return ErrDuplicateKitID
	}
	if err != nil {
		return fmt.Errorf("store: insert member: %w", err)
	}
	return nil
}

// GetMember fetches a member by KIT ID, or ErrNotFound if no such member
// exists. Callers must not use this to distinguish "unknown KIT ID" from
// other auth failures in their own responses — see invariant #6 (generic
// auth errors) — but the store layer itself has no reason to blur that
// distinction, since only the handler decides what the client sees.
func (s *Store) GetMember(ctx context.Context, kitID string) (*Member, error) {
	var m Member
	err := s.pool.QueryRow(ctx, `
		SELECT id, registered, totp_secret_enc, created_at, updated_at
		FROM members WHERE id = $1
	`, kitID).Scan(&m.ID, &m.Registered, &m.TOTPSecretEnc, &m.CreatedAt, &m.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: get member: %w", err)
	}
	return &m, nil
}

// SetMemberTOTPSecret stores a freshly generated (already-encrypted) TOTP
// secret for kitID. Used by both first-time onboarding and lost-device
// recovery — both flows generate a brand new secret (see claude.md's
// "Recovery keys have a purpose" section on why recovery doesn't reuse the
// old one).
func (s *Store) SetMemberTOTPSecret(ctx context.Context, kitID string, secretEnc []byte) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE members SET totp_secret_enc = $2, updated_at = now()
		WHERE id = $1
	`, kitID, secretEnc)
	if err != nil {
		return fmt.Errorf("store: set member totp secret: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// MarkMemberRegistered flips a member to registered=true. Called only from
// OnboardComplete, once the member has proven control of the TOTP secret
// by submitting a valid code.
func (s *Store) MarkMemberRegistered(ctx context.Context, kitID string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE members SET registered = true, updated_at = now()
		WHERE id = $1
	`, kitID)
	if err != nil {
		return fmt.Errorf("store: mark member registered: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// =========================================================================
// recovery_keys
// =========================================================================

// RecoveryKey mirrors one row of the recovery_keys table.
type RecoveryKey struct {
	ID        int64
	MemberID  string
	CodeHash  string
	Purpose   string
	UsedAt    *time.Time
	CreatedAt time.Time
}

// InsertRecoveryKeys batch-inserts already-hashed recovery keys for one
// member and purpose. hashes is expected to already be bcrypt output (see
// auth.HashRecoveryKey) — this layer never sees plaintext.
func (s *Store) InsertRecoveryKeys(ctx context.Context, memberID, purpose string, hashes []string) error {
	batch := &pgx.Batch{}
	for _, h := range hashes {
		batch.Queue(`
			INSERT INTO recovery_keys (member_id, code_hash, purpose)
			VALUES ($1, $2, $3)
		`, memberID, h, purpose)
	}
	br := s.pool.SendBatch(ctx, batch)
	defer br.Close()
	for range hashes {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("store: insert recovery key: %w", err)
		}
	}
	return nil
}

// GetUnusedRecoveryKeys returns every unused recovery key for memberID with
// the given purpose. Callers (OnboardBegin, Recovery) bcrypt-compare the
// candidate plaintext against each returned hash in turn — there can only
// ever be a handful of unused keys per member per purpose (3 total minted,
// ever), so this is a cheap loop, not a scan.
func (s *Store) GetUnusedRecoveryKeys(ctx context.Context, memberID, purpose string) ([]RecoveryKey, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, member_id, code_hash, purpose, used_at, created_at
		FROM recovery_keys
		WHERE member_id = $1 AND purpose = $2 AND used_at IS NULL
	`, memberID, purpose)
	if err != nil {
		return nil, fmt.Errorf("store: get unused recovery keys: %w", err)
	}
	defer rows.Close()

	var keys []RecoveryKey
	for rows.Next() {
		var k RecoveryKey
		if err := rows.Scan(&k.ID, &k.MemberID, &k.CodeHash, &k.Purpose, &k.UsedAt, &k.CreatedAt); err != nil {
			return nil, fmt.Errorf("store: scan recovery key: %w", err)
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

// MarkRecoveryKeyUsed stamps a recovery key as spent so it can never be
// redeemed a second time.
func (s *Store) MarkRecoveryKeyUsed(ctx context.Context, id int64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE recovery_keys SET used_at = now() WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("store: mark recovery key used: %w", err)
	}
	return nil
}

// =========================================================================
// medical_records
// =========================================================================

// RecordMeta is the metadata-only view returned by ListRecords — no
// decrypted content, just enough to let a member pick a record to open.
type RecordMeta struct {
	ID          int64
	RowIndex    int
	SourceBatch uuid.UUID
	CreatedAt   time.Time
}

// Record is the full row, including still-encrypted content. Handlers
// decrypt ContentEnc themselves via the shared Encryptor — the store layer
// never touches plaintext record content.
type Record struct {
	ID          int64
	MemberID    string
	ContentEnc  []byte
	RowIndex    int
	SourceBatch uuid.UUID
	CreatedAt   time.Time
}

// InsertMedicalRecord stores one already-encrypted record row, tagged with
// which ingestion batch it came from.
func (s *Store) InsertMedicalRecord(ctx context.Context, memberID string, contentEnc []byte, rowIndex int, sourceBatch uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO medical_records (member_id, content_enc, row_index, source_batch)
		VALUES ($1, $2, $3, $4)
	`, memberID, contentEnc, rowIndex, sourceBatch)
	if err != nil {
		return fmt.Errorf("store: insert medical record: %w", err)
	}
	return nil
}

// ListRecordsForMember returns metadata for every record belonging to
// memberID, ordered oldest-first within each batch so a multi-row CSV
// import reads back in its original row order.
func (s *Store) ListRecordsForMember(ctx context.Context, memberID string) ([]RecordMeta, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, row_index, source_batch, created_at
		FROM medical_records
		WHERE member_id = $1
		ORDER BY source_batch, row_index
	`, memberID)
	if err != nil {
		return nil, fmt.Errorf("store: list records: %w", err)
	}
	defer rows.Close()

	var out []RecordMeta
	for rows.Next() {
		var r RecordMeta
		if err := rows.Scan(&r.ID, &r.RowIndex, &r.SourceBatch, &r.CreatedAt); err != nil {
			return nil, fmt.Errorf("store: scan record meta: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetRecordForMember fetches one record by ID, scoped to memberID in the
// SAME query (not fetched-then-checked) — this is what makes invariant #5
// structural rather than a discipline: there is no code path where a
// record row for a different member is ever loaded into memory here, so a
// handler bug elsewhere can't accidentally leak it. Returns ErrNotFound
// whether the ID doesn't exist at all or belongs to a different member,
// which the handler turns into a 404 either way.
func (s *Store) GetRecordForMember(ctx context.Context, memberID string, recordID int64) (*Record, error) {
	var r Record
	err := s.pool.QueryRow(ctx, `
		SELECT id, member_id, content_enc, row_index, source_batch, created_at
		FROM medical_records
		WHERE id = $1 AND member_id = $2
	`, recordID, memberID).Scan(&r.ID, &r.MemberID, &r.ContentEnc, &r.RowIndex, &r.SourceBatch, &r.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: get record: %w", err)
	}
	return &r, nil
}

// =========================================================================
// ingestion_batches
// =========================================================================

// IngestionBatch mirrors one CSV upload.
type IngestionBatch struct {
	ID         uuid.UUID
	MemberID   string
	UploadedBy string
	Filename   string
	RowCount   int
	Status     string
	CreatedAt  time.Time
}

// InsertIngestionBatch records one completed (or failed) CSV upload for
// audit/debugging purposes — "which admin uploaded what, when, how many
// rows."
func (s *Store) InsertIngestionBatch(ctx context.Context, b IngestionBatch) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO ingestion_batches (id, member_id, uploaded_by, filename, row_count, status)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, b.ID, b.MemberID, b.UploadedBy, b.Filename, b.RowCount, b.Status)
	if err != nil {
		return fmt.Errorf("store: insert ingestion batch: %w", err)
	}
	return nil
}

// =========================================================================
// record_access_log
// =========================================================================

// LogRecordAccess records that memberID viewed recordID from ipAddress.
// Called from GetRecord on every successful (ownership-checked) read —
// this is the audit trail a member or their care team could later use to
// answer "who looked at this, and when."
func (s *Store) LogRecordAccess(ctx context.Context, memberID string, recordID int64, ipAddress string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO record_access_log (member_id, record_id, ip_address)
		VALUES ($1, $2, $3)
	`, memberID, recordID, ipAddress)
	if err != nil {
		return fmt.Errorf("store: log record access: %w", err)
	}
	return nil
}

// =========================================================================
// audit_log
// =========================================================================

// LogAudit writes one audit row. actorAdminEmail is nil for
// member-originated events (login, recovery) and set for admin-performed
// actions (provision, ingest, invite) — see the schema comment in
// claude.md for why that column is nullable rather than a second table.
func (s *Store) LogAudit(ctx context.Context, principal, eventType, ipAddress string, detail map[string]any, actorAdminEmail *string) error {
	detailJSON, err := json.Marshal(detail)
	if err != nil {
		return fmt.Errorf("store: marshal audit detail: %w", err)
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO audit_log (principal, event_type, ip_address, detail, actor_admin_email)
		VALUES ($1, $2, $3, $4, $5)
	`, principal, eventType, ipAddress, detailJSON, actorAdminEmail)
	if err != nil {
		return fmt.Errorf("store: log audit: %w", err)
	}
	return nil
}

// =========================================================================
// admins
// =========================================================================

// Admin mirrors the admins table.
type Admin struct {
	ID           int64
	Email        string
	PasswordHash string
	Role         string
	Active       bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// InsertAdmin creates a new admin row. Called from exactly two places in
// the whole system: cmd/bootstrap-admin (the very first admin, run once
// over SSH) and AcceptInvite (every admin after that) — never from an
// unauthenticated HTTP endpoint (invariant #9).
func (s *Store) InsertAdmin(ctx context.Context, email, passwordHash string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO admins (email, password_hash) VALUES ($1, $2)
	`, email, passwordHash)
	if isUniqueViolation(err) {
		return fmt.Errorf("store: admin email already exists: %w", err)
	}
	if err != nil {
		return fmt.Errorf("store: insert admin: %w", err)
	}
	return nil
}

// GetAdminByEmail fetches an admin by email, or ErrNotFound. AdminLogin
// treats "no such admin" and "wrong password" identically to the caller
// (invariant #6) — this function just reports what it found.
func (s *Store) GetAdminByEmail(ctx context.Context, email string) (*Admin, error) {
	var a Admin
	err := s.pool.QueryRow(ctx, `
		SELECT id, email, password_hash, role, active, created_at, updated_at
		FROM admins WHERE email = $1
	`, email).Scan(&a.ID, &a.Email, &a.PasswordHash, &a.Role, &a.Active, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: get admin by email: %w", err)
	}
	return &a, nil
}

// =========================================================================
// admin_invites
// =========================================================================

// AdminInvite mirrors the admin_invites table.
type AdminInvite struct {
	ID        int64
	Email     string
	TokenHash string
	InvitedBy string
	UsedAt    *time.Time
	ExpiresAt time.Time
	CreatedAt time.Time
}

// InsertAdminInvite records a new pending invite. token is bcrypt-hashed by
// the caller before it ever reaches this function — the plaintext is
// returned to the inviting admin once and never stored.
func (s *Store) InsertAdminInvite(ctx context.Context, email, tokenHash, invitedBy string, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO admin_invites (email, token_hash, invited_by, expires_at)
		VALUES ($1, $2, $3, $4)
	`, email, tokenHash, invitedBy, expiresAt)
	if err != nil {
		return fmt.Errorf("store: insert admin invite: %w", err)
	}
	return nil
}

// GetPendingInvitesByEmail returns every unused, unexpired invite for
// email. AcceptInvite bcrypt-compares the submitted plaintext token against
// each returned hash — in practice there's almost always at most one, but
// nothing stops an admin being re-invited before accepting the first
// invite.
func (s *Store) GetPendingInvitesByEmail(ctx context.Context, email string) ([]AdminInvite, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, email, token_hash, invited_by, used_at, expires_at, created_at
		FROM admin_invites
		WHERE email = $1 AND used_at IS NULL AND expires_at > now()
	`, email)
	if err != nil {
		return nil, fmt.Errorf("store: get pending invites: %w", err)
	}
	defer rows.Close()

	var out []AdminInvite
	for rows.Next() {
		var inv AdminInvite
		if err := rows.Scan(&inv.ID, &inv.Email, &inv.TokenHash, &inv.InvitedBy, &inv.UsedAt, &inv.ExpiresAt, &inv.CreatedAt); err != nil {
			return nil, fmt.Errorf("store: scan admin invite: %w", err)
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

// MarkInviteUsed stamps an invite as spent so it can't be replayed.
func (s *Store) MarkInviteUsed(ctx context.Context, id int64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE admin_invites SET used_at = now() WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("store: mark invite used: %w", err)
	}
	return nil
}
