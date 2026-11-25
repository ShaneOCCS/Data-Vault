#!/usr/bin/env bash
# Step 2 — update the database structure.
# Builds the migration tool, copies it to the instance and runs it THERE
# (the database only accepts connections from inside AWS). It asks for the
# database owner's password on the instance; the password is never saved.
source "$(dirname "$0")/lib.sh"
load_config

step "Building the migration tool"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
build_linux "$tmp/migrate" ./cmd/migrate
ok "Built"

step "Copying it to the instance"
copy_to_ec2 "$tmp/migrate" /tmp/vault-migrate
on_ec2 "chmod 700 /tmp/vault-migrate"
ok "Copied"

run_remote_script migrate.sh "${DB_OWNER:-}"

step "Database is up to date"
info "Next: ./deploy/scripts/03-deploy.sh"
