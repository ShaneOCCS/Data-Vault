-- 0001_init.sql — core schema: members, recovery keys, records, and the
-- two audit trails (per-view access log, and the general-purpose event
-- log). See claude.md's "Database schema" section for the full rationale
-- behind each column; the comments here call out only what isn't obvious
-- from the column list alone.

CREATE TABLE members (
    id              varchar(7)   PRIMARY KEY,     -- the KIT ID itself — never a name, DOB, or other direct identifier (invariant #1)
    registered      boolean      NOT NULL DEFAULT false,
    totp_secret_enc bytea,                         -- NULL until first onboarding (or re-enrollment via recovery); encrypted, never plaintext (invariant #2)
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE recovery_keys (
    id         bigserial    PRIMARY KEY,
    member_id  varchar(7)   NOT NULL REFERENCES members(id),
    code_hash  text         NOT NULL,               -- bcrypt hash; plaintext is shown to the admin once and never stored (invariant #3)
    purpose    text         NOT NULL CHECK (purpose IN ('signup', 'recovery')), -- see claude.md "Recovery keys have a purpose" — a key minted for one purpose can never be redeemed by the other flow
    used_at    timestamptz,                          -- single-use: NULL means still redeemable
    created_at timestamptz  NOT NULL DEFAULT now()
);

-- Every redemption attempt looks up "this member's unused keys of this
-- purpose" (see store.GetUnusedRecoveryKeys), so that's exactly what this
-- partial index covers.
CREATE INDEX idx_recovery_keys_member_purpose
    ON recovery_keys (member_id, purpose)
    WHERE used_at IS NULL;

-- member_id is a soft link (no FK) on purpose, matching ingestion_batches
-- below: this table is written to by whatever eventually becomes the
-- separate, KIT-ID-blind ingestion path described in claude.md's
-- "Deliberate scope limits" — a hard FK to members would require that
-- future service to also have visibility into the members table, which
-- defeats the point of splitting it out.
CREATE TABLE medical_records (
    id           bigserial   PRIMARY KEY,
    member_id    varchar(7)  NOT NULL,
    content_enc  bytea       NOT NULL,               -- one JSON-encoded, ordered [{column,value}] row, encrypted whole (invariant #2)
    row_index    int         NOT NULL,               -- original row position within its source CSV, so a read-back preserves order
    source_batch uuid        NOT NULL,                -- which ingestion_batches row produced this
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_medical_records_member ON medical_records (member_id);

CREATE TABLE ingestion_batches (
    id         uuid        PRIMARY KEY,
    member_id  varchar(7)  NOT NULL,
    uploaded_by text       NOT NULL,                  -- inviting/uploading admin's email
    filename   text        NOT NULL,
    row_count  int         NOT NULL,
    status     text        NOT NULL,                  -- 'completed' today; a future async pipeline could add 'processing'/'failed'
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE record_access_log (
    id          bigserial   PRIMARY KEY,
    member_id   varchar(7)  NOT NULL,
    record_id   bigint      NOT NULL,
    ip_address  inet,
    accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_record_access_log_member ON record_access_log (member_id);

-- General-purpose event log — every write and every credential check in
-- this system logs here (see handlers/*.go's LogAudit calls). detail is
-- jsonb rather than a fixed set of columns because each event_type carries
-- different metadata (a row count for 'ingest', an invited-by email for
-- 'admin_invite_created', nothing at all for 'login').
CREATE TABLE audit_log (
    id                bigserial   PRIMARY KEY,
    principal         varchar(64) NOT NULL,           -- the KIT ID or admin email this event is about
    event_type        text        NOT NULL,
    ip_address        inet,
    detail            jsonb,
    actor_admin_email text,                            -- set for admin-performed actions (provision/ingest/invite); NULL for member-originated events (login/recovery) — see claude.md's schema notes
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_principal ON audit_log (principal);
