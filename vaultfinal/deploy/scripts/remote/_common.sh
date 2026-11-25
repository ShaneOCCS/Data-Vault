#!/usr/bin/env bash
# _common.sh — helpers prepended to every script that runs ON the EC2
# instance (see run_remote_script in ../lib.sh). Not run on its own.
set -euo pipefail

APP_ENV_FILE=/etc/vaultfinal/vaultfinal.env

if [ -t 1 ]; then
	BOLD=$'\e[1m' GREEN=$'\e[32m' RED=$'\e[31m' YELLOW=$'\e[33m' RESET=$'\e[0m'
else
	BOLD='' GREEN='' RED='' YELLOW='' RESET=''
fi
step() { printf '\n%s--> [server] %s%s\n' "$BOLD" "$*" "$RESET"; }
ok() { printf '%s  [ok]%s %s\n' "$GREEN" "$RESET" "$*"; }
info() { printf '       %s\n' "$*"; }
warn() { printf '%s  [!]%s  %s\n' "$YELLOW" "$RESET" "$*"; }
die() {
	printf '%s  [x]%s  %s\n' "$RED" "$RESET" "$*" >&2
	exit 1
}
confirm() {
	local answer
	read -rp "       $1 [y/N] " answer
	[[ $answer =~ ^[Yy] ]]
}

# app_database_url — the app's own connection string (as vaultapp), read
# from the env file fetch-secrets.sh writes. Read with grep rather than
# sourcing the file, so special characters in the password can't break it.
app_database_url() {
	sudo grep -m1 '^DATABASE_URL=' "$APP_ENV_FILE" | cut -d= -f2-
}

ensure_psql() {
	command -v psql >/dev/null 2>&1 && return
	info "Installing the PostgreSQL command-line client (one time)..."
	sudo dnf install -y -q postgresql16 >/dev/null 2>&1 ||
		sudo dnf install -y -q postgresql15 >/dev/null 2>&1 ||
		die "Could not install the PostgreSQL client (dnf install postgresql16)."
}

# use_pg_url URL — exports PGHOST/PGUSER/PGPASSWORD/... for psql, so the
# password never appears on a command line (visible in `ps`).
use_pg_url() {
	eval "$(
		python3 - "$1" <<'PY'
import shlex, sys, urllib.parse as u
p = u.urlsplit(sys.argv[1])
q = dict(u.parse_qsl(p.query))
env = {
    "PGHOST": p.hostname or "",
    "PGPORT": str(p.port or 5432),
    "PGUSER": u.unquote(p.username or ""),
    "PGPASSWORD": u.unquote(p.password or ""),
    "PGDATABASE": u.unquote(p.path.lstrip("/")),
    "PGSSLMODE": q.get("sslmode", "require"),
}
for k, v in env.items():
    print(f"export {k}={shlex.quote(v)}")
PY
	)"
}

# app_sql "SQL" — runs SQL as the app user and prints result rows.
app_sql() {
	ensure_psql
	(
		use_pg_url "$(app_database_url)"
		psql -v ON_ERROR_STOP=1 -qtA -c "$1"
	)
}

# owner_database_url — builds a connection string for the database OWNER
# (needed for schema changes), reusing the host/port/database name from the
# app's connection string and asking for the owner's name and password.
# $1 = owner user name (may be empty, then it's asked for).
owner_database_url() {
	local owner="${1:-}" password
	if [ -z "$owner" ]; then
		read -rp "       Database owner user name (usually the RDS master user): " owner
	fi
	[ -n "$owner" ] || die "No database owner given."
	read -rsp "       Password for $owner (typing is hidden): " password
	echo >&2
	[ -n "$password" ] || die "No password given."
	python3 - "$(app_database_url)" "$owner" "$password" <<'PY'
import sys, urllib.parse as u
app, owner, pw = sys.argv[1], sys.argv[2], sys.argv[3]
p = u.urlsplit(app)
q = dict(u.parse_qsl(p.query))
q.setdefault("sslmode", "require")
netloc = f"{u.quote(owner, safe='')}:{u.quote(pw, safe='')}@{p.hostname}:{p.port or 5432}"
print(u.urlunsplit((p.scheme or "postgres", netloc, p.path, u.urlencode(q), "")))
PY
}
