#!/usr/bin/env bash
# Step 4 — check the new version on the instance itself.
# Read-only apart from two harmless failed-login attempts, which also prove
# that failed attempts now land in the audit log.
source "$(dirname "$0")/lib.sh"
load_config

run_remote_script verify.sh

step "Checking that the app's port is NOT reachable from the internet"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://$EC2_HOST:8080/" || true)"
if [ "$code" = "000" ]; then
	ok "Port 8080 is closed to the outside (correct)"
else
	warn "Port 8080 answered from the internet (HTTP $code)."
	info "Remove port 8080 from the instance's security group inbound rules."
	info "Keep 22 open to your IP only."
	info "Use ./deploy/scripts/tunnel.sh to reach the app from your computer instead."
fi

step "Verification done"
info "Next: ./deploy/scripts/05-smoke-test.sh"
