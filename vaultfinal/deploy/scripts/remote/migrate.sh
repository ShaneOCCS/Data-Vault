
# migrate.sh — runs ON the instance (uploaded by 02-migrate.sh).
# $1 = database owner user name (optional; asked for if empty).
BIN=/tmp/vault-migrate
trap 'rm -f "$BIN"' EXIT
[ -x "$BIN" ] || die "Migration tool not found at $BIN."

step "Connecting as the database owner"
info "Schema changes need the account that owns the tables (usually the RDS master"
info "user), not vaultapp. Host and database name are taken from the app's settings."
DATABASE_URL="$(owner_database_url "${1:-}")"
export DATABASE_URL

status="$("$BIN" status 2>&1)" || {
	echo "$status"
	die "Could not read migration status. Wrong user name or password? (Nothing was changed.)"
}
echo "$status" | sed 's/^/       /'

if ! grep -q '^applied' <<<"$status"; then
	step "First run of the migration tool on this database"
	info "The tool has no record of this database yet. For your EXISTING deployment the"
	info "first four migrations were already applied by hand, so they must be recorded"
	info "as done ('baseline') instead of run again."
	if confirm "Is this the existing database that already has the app's tables?"; then
		"$BIN" baseline 0004_admin_invites | sed 's/^/       /'
		ok "Recorded 0001-0004 as already applied"
	else
		warn "Treating it as an EMPTY database: all migrations will run from the start."
		confirm "Continue?" || die "Stopped. Nothing was changed."
	fi
fi

step "Applying new migrations"
"$BIN" up | sed 's/^/       /' || die "A migration failed and was rolled back (nothing half-applied). See the message above."
info "Current state:"
"$BIN" status | sed 's/^/         /'
grep -q '^pending' <<<"$("$BIN" status)" && die "Some migrations are still pending."
ok "All migrations applied"
unset DATABASE_URL
