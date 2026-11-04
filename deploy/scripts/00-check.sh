#!/usr/bin/env bash
# Step 0 — check that everything is ready. Changes nothing anywhere.
#   - your settings file exists and the SSH key is there
#   - the tools the other scripts need are installed on this computer
#   - the code builds and the tests pass
#   - you can SSH into the instance and use sudo there
source "$(dirname "$0")/lib.sh"

step "Reading deploy/deploy.env"
load_config
ok "Instance: $SSH_TARGET (key: $SSH_KEY)"

step "Checking tools on this computer"
require_tools go ssh scp curl
find_python
ok "go, ssh, scp, curl and $PY are installed"

step "Building and testing the code (about a minute)"
(cd "$APP_DIR" && go build ./... && go vet ./... && go test ./... >/dev/null) ||
	die "Build or tests failed. Fix that before deploying."
ok "Code builds and tests pass (database tests are skipped here; that's expected)"

step "Connecting to the instance"
on_ec2 true || die "SSH failed. Check EC2_HOST and SSH_KEY in deploy.env, and that port 22 is open to your IP in the security group."
ok "SSH works"
on_ec2 "sudo -n true" || die "SSH works but sudo needs a password. Use the ec2-user account."
ok "sudo works"

state="$(on_ec2 "systemctl is-active medical-vault 2>/dev/null || true")"
if [ "$state" = "active" ]; then
	ok "The current Medical Vault service is running"
else
	warn "The medical-vault service is '$state' right now. That's OK if this is a first install; otherwise check it before continuing."
fi
step "Checking how the current app is run (the scripts replace /opt/vaultfinal/server)"
exec_start="$(on_ec2 "systemctl show -p ExecStart --value medical-vault 2>/dev/null || true")"
if grep -q 'path=/opt/vaultfinal/server ' <<<"$exec_start"; then
	ok "The medical-vault service runs /opt/vaultfinal/server"
else
	warn "The medical-vault service does NOT run /opt/vaultfinal/server:"
	info "  ${exec_start:-(no medical-vault service found)}"
	info "Deploying would install the new version somewhere the running app doesn't use."
	die "Install deploy/medical-vault.service on the server first, or ask for help."
fi
listener="$(on_ec2 "sudo ss -ltnpH 'sport = :8080' 2>/dev/null || true")"
if [ -z "$listener" ]; then
	warn "Nothing is listening on port 8080 right now."
elif grep -q '"server"' <<<"$listener"; then
	ok "Port 8080 is served by the service's program"
else
	warn "Port 8080 is used by something other than /opt/vaultfinal/server:"
	info "  $listener"
	info "Probably a copy started by hand (e.g. 'go run' or a binary in your home folder)."
	die "Stop that process first, or the new version can't start (the port is taken)."
fi
copies="$(on_ec2 "find /home -maxdepth 3 -name go.mod -path '*vaultfinal*' 2>/dev/null; sudo find /home -maxdepth 4 -name .env -path '*vaultfinal*' 2>/dev/null" || true)"
if [ -n "$copies" ]; then
	warn "Found an old copy of the project on the server (not used by the service, harmless):"
	echo "$copies" | sed 's/^/         /'
	grep -q '\.env$' <<<"$copies" &&
		warn "It includes a .env file, which may hold secrets. Consider deleting it (see deploy.md)."
fi

on_ec2 "sudo test -f /etc/vaultfinal/vaultfinal.env" ||
	warn "/etc/vaultfinal/vaultfinal.env doesn't exist yet. It's created when the service starts (fetch-secrets.sh)."

step "All checks passed"
info "Next: ./deploy/scripts/01-backup.sh"
