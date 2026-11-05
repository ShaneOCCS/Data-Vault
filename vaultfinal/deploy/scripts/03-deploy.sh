#!/usr/bin/env bash
# Step 3 — replace the running server program with the new version.
# Builds it, copies it over, installs it as /opt/vaultfinal/server and
# restarts the service. Refuses to run unless step 1 saved a backup.
source "$(dirname "$0")/lib.sh"
load_config

step "Checking that a backup exists"
on_ec2 "test -f /opt/vaultfinal/server.prev" ||
	die "No backup at /opt/vaultfinal/server.prev. Run ./deploy/scripts/01-backup.sh first."
ok "Backup found"

step "Building the new server program"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
build_linux "$tmp/server" ./cmd/server
ok "Built"

step "Installing it on the instance and restarting"
copy_to_ec2 "$tmp/server" /tmp/vault-server
on_ec2 "sudo install -o vaultapp -g vaultapp -m 755 /tmp/vault-server /opt/vaultfinal/server &&
        rm -f /tmp/vault-server &&
        sudo systemctl restart medical-vault"
ok "Installed and restarted"

step "Checking that it started"
sleep 4
state="$(on_ec2 "systemctl is-active medical-vault || true")"
logs="$(on_ec2 "sudo journalctl -u medical-vault --since '-2 min' --no-pager -o cat | tail -n 20")"
if [ "$state" != "active" ] || ! grep -q 'listening on' <<<"$logs"; then
	echo "$logs" | sed 's/^/       /'
	die "The service did not start properly (state: $state). To go back: ./deploy/scripts/rollback.sh"
fi
grep 'listening on' <<<"$logs" | tail -n 1 | sed 's/^/       /'
ok "Service is running"

step "New version deployed"
info "Next: ./deploy/scripts/04-verify.sh"
