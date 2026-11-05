
# undo-migration.sh — runs ON the instance (uploaded by rollback.sh).
# Reverts migration 0005 (the admins.role check). $1 = owner user (optional).
step "Undoing migration 0005_admin_role_check"
url="$(owner_database_url "${1:-}")"
ensure_psql
(
	use_pg_url "$url"
	psql -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
DELETE FROM schema_migrations WHERE version = '0005_admin_role_check';
COMMIT;
SQL
)
ok "Migration 0005 undone"
