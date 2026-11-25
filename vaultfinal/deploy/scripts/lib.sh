#!/usr/bin/env bash
# lib.sh — shared helpers for the deploy scripts. Sourced by every
# numbered script; not meant to be run on its own.
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPTS_DIR")"
APP_DIR="$(dirname "$DEPLOY_DIR")" # the vaultfinal/ folder (contains go.mod)
CONFIG_FILE="$DEPLOY_DIR/deploy.env"

# ---------- output ----------
if [ -t 1 ]; then
	BOLD=$'\e[1m' GREEN=$'\e[32m' RED=$'\e[31m' YELLOW=$'\e[33m' RESET=$'\e[0m'
else
	BOLD='' GREEN='' RED='' YELLOW='' RESET=''
fi
step() { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$RESET"; }
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

# ---------- config ----------
load_config() {
	[ -f "$CONFIG_FILE" ] || die "Missing deploy/deploy.env. Run: cp deploy/deploy.env.example deploy/deploy.env  and fill it in."
	# shellcheck disable=SC1090
	source <(tr -d '\r' <"$CONFIG_FILE")
	: "${EC2_HOST:?EC2_HOST is empty in deploy/deploy.env}"
	: "${SSH_KEY:?SSH_KEY is empty in deploy/deploy.env}"
	SSH_USER="${SSH_USER:-ec2-user}"
	[ -f "$SSH_KEY" ] || die "SSH key not found at $SSH_KEY (check SSH_KEY in deploy/deploy.env)"
	SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o LogLevel=ERROR)
	SSH_TARGET="$SSH_USER@$EC2_HOST"
}

# ---------- talking to the EC2 instance ----------
on_ec2() { ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }
copy_to_ec2() { scp -q "${SSH_OPTS[@]}" "$1" "$SSH_TARGET:$2"; }

# run_remote_script NAME [ARGS...]
# Uploads deploy/scripts/remote/NAME (with remote/_common.sh prepended and
# Windows line endings stripped) and runs it on the instance with a
# terminal attached, so it can ask questions. The uploaded copy is deleted
# afterwards.
run_remote_script() {
	local name="$1"
	shift
	local remote="/tmp/vault-$name"
	cat "$SCRIPTS_DIR/remote/_common.sh" "$SCRIPTS_DIR/remote/$name" | tr -d '\r' |
		on_ec2 "umask 077 && cat > $remote"
	local args=""
	[ $# -gt 0 ] && args="$(printf '%q ' "$@")"
	ssh -t "${SSH_OPTS[@]}" "$SSH_TARGET" "bash $remote $args; rc=\$?; rm -f $remote; exit \$rc"
}

# app_sql "SQL" — runs SQL on the app database as the app's own user
# (vaultapp), using the connection string already on the instance. Prints
# the result rows. (VAULT_SQL_URL overrides this with a local database,
# which is only used to test these scripts.)
app_sql() {
	if [ -n "${VAULT_SQL_URL:-}" ]; then
		psql "$VAULT_SQL_URL" -v ON_ERROR_STOP=1 -qtA -c "$1" | tr -d '\r'
		return
	fi
	# The helper script and the SQL travel together over stdin; nothing is
	# written to disk on the instance.
	{
		cat "$SCRIPTS_DIR/remote/_common.sh"
		printf "app_sql \"\$(cat <<'__VAULT_SQL__'\n%s\n__VAULT_SQL__\n)\"\n" "$1"
	} | tr -d '\r' | on_ec2 "bash -s" | tr -d '\r'
}

# ---------- local tools ----------
find_python() {
	local p
	for p in python3 python; do
		if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 6) else 1)' >/dev/null 2>&1; then
			PY="$p"
			return
		fi
	done
	die "Python 3 is required on this computer (https://www.python.org/downloads/)."
}

require_tools() {
	local t missing=()
	for t in "$@"; do command -v "$t" >/dev/null 2>&1 || missing+=("$t"); done
	[ ${#missing[@]} -eq 0 ] || die "Missing tools on this computer: ${missing[*]}"
}

# build_linux OUTPUT PACKAGE — cross-compiles a Linux binary for the instance.
build_linux() {
	(cd "$APP_DIR" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o "$1" "$2")
}

# ---------- SSH tunnel ----------
# The app's session cookies are "Secure": browsers and curl only send them
# over HTTPS or to localhost. With no HTTPS set up, an SSH tunnel makes the
# app on the instance appear at http://localhost:$TUNNEL_PORT on this
# computer — encrypted by SSH, with port 8080 still closed to the internet.
TUNNEL_PORT="${TUNNEL_PORT:-18080}"

tunnel_up() { curl -s -o /dev/null --max-time 2 "http://localhost:$TUNNEL_PORT/api/session/me"; }

# open_tunnel — starts the tunnel in the background and waits until the app
# answers through it. Sets TUNNEL_PID; call close_tunnel when done.
open_tunnel() {
	if tunnel_up; then
		die "Something is already using port $TUNNEL_PORT on this computer (another tunnel?). Close it, or set TUNNEL_PORT=18081."
	fi
	ssh -N -L "$TUNNEL_PORT:127.0.0.1:8080" -o ExitOnForwardFailure=yes "${SSH_OPTS[@]}" "$SSH_TARGET" &
	TUNNEL_PID=$!
	local i
	for i in $(seq 1 20); do
		tunnel_up && return 0
		kill -0 "$TUNNEL_PID" 2>/dev/null || die "The SSH tunnel could not be opened (see the message above)."
		sleep 0.5
	done
	close_tunnel
	die "The tunnel opened but the app didn't answer. Is the service running? (./deploy/scripts/04-verify.sh)"
}

close_tunnel() {
	[ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
	TUNNEL_PID=""
}
