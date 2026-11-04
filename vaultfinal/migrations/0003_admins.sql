-- 0003_admins.sql — admin accounts.
--
-- Split into its own migration purely to keep each migration reviewable as
-- one concern (there's no sequencing requirement forcing this split on a
-- from-scratch build) — see claude.md's schema section.

CREATE TABLE admins (
    id            bigserial   PRIMARY KEY,
    email         text        NOT NULL UNIQUE,
    password_hash text        NOT NULL,               -- bcrypt; admins, unlike members, do use a typed password (invariant #3)
    role          text        NOT NULL DEFAULT 'superadmin', -- one role today; column exists so RBAC can be added later without a migration
    active        boolean     NOT NULL DEFAULT true,   -- disable, don't delete, so audit_log.actor_admin_email stays meaningful
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON admins TO vaultapp;
GRANT USAGE, SELECT ON SEQUENCE admins_id_seq TO vaultapp;
