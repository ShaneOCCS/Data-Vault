-- 0004_admin_invites.sql — single-use, time-limited admin invite tokens.
-- Every admin after the first is created through this table (invariant
-- #9) — POST /api/admin/invites inserts a row, POST /api/admin/invites/accept
-- redeems it.

CREATE TABLE admin_invites (
    id          bigserial   PRIMARY KEY,
    email       text        NOT NULL,
    token_hash  text        NOT NULL,                 -- bcrypt hash of a single-use invite token; plaintext shown once to the inviting admin
    invited_by  text        NOT NULL,                 -- inviting admin's email
    used_at     timestamptz,
    expires_at  timestamptz NOT NULL,                 -- invites are time-limited, unlike recovery keys, which only expire by being used
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- AcceptInvite looks up "this email's unused, unexpired invites" (see
-- store.GetPendingInvitesByEmail).
CREATE INDEX idx_admin_invites_email
    ON admin_invites (email)
    WHERE used_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON admin_invites TO vaultapp;
GRANT USAGE, SELECT ON SEQUENCE admin_invites_id_seq TO vaultapp;
