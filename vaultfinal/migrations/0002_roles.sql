-- 0002_roles.sql — least-privilege database roles.
--
-- Deliberately no passwords are set here. Set each role's login password
-- out-of-band after running this migration (e.g. `ALTER ROLE vaultapp WITH
-- PASSWORD '...'` run manually over the same SSH session used to run
-- migrations, or via the RDS console) — a real credential has no business
-- living in a git-tracked file, migration or otherwise.

-- vaultapp is the one role cmd/server currently connects as. It gets
-- exactly the privileges the application needs and nothing else: no
-- DELETE (nothing in this system ever hard-deletes a row — admins and
-- invites are disabled/expired via a flag or timestamp instead, so
-- audit_log.actor_admin_email and audit trails stay meaningful forever),
-- no DDL, no superuser.
CREATE ROLE vaultapp LOGIN;

GRANT SELECT, INSERT, UPDATE ON
    members, recovery_keys, medical_records, ingestion_batches,
    record_access_log, audit_log
TO vaultapp;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaultapp;

-- app_ingest is provisioned now but NOT connected to by anything today —
-- see claude.md's "Deliberate scope limits": the KIT-ID-blind guarantee
-- this role is meant to enforce only becomes a real security boundary once
-- CSV ingestion is split into its own service with its own credentials,
-- separate from the main API. Creating the role in this migration means
-- that future split doesn't require a schema change, only a new binary
-- that connects as app_ingest instead of vaultapp.
CREATE ROLE app_ingest LOGIN;

GRANT INSERT ON medical_records, ingestion_batches TO app_ingest;
GRANT USAGE, SELECT ON SEQUENCE medical_records_id_seq TO app_ingest;
