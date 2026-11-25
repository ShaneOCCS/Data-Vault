#!/usr/bin/env bash
# Step 1 — back up before changing anything.
#   1. A snapshot of the RDS database (automatic if RDS_INSTANCE_ID is set
#      and the AWS CLI is configured; otherwise you do it in the console).
#   2. A copy of the server program currently running on the instance, so
#      rollback.sh can put it back in seconds.
source "$(dirname "$0")/lib.sh"
load_config

step "1/2  Database snapshot"
snapshot="vault-pre-deploy-$(date +%Y%m%d-%H%M)"
if [ -n "${RDS_INSTANCE_ID:-}" ] && command -v aws >/dev/null 2>&1; then
	info "Creating RDS snapshot '$snapshot' of '$RDS_INSTANCE_ID'..."
	aws rds create-db-snapshot --db-instance-identifier "$RDS_INSTANCE_ID" \
		--db-snapshot-identifier "$snapshot" >/dev/null ||
		die "The AWS CLI could not create the snapshot. Take it in the console instead (see below) and rerun."
	info "Waiting for it to finish (this can take several minutes)..."
	aws rds wait db-snapshot-available --db-snapshot-identifier "$snapshot" ||
		die "The snapshot didn't become available. Check it in the RDS console."
	ok "Snapshot '$snapshot' is available"
else
	info "Take the snapshot in the AWS console:"
	info "  RDS -> Databases -> (your database) -> Actions -> Take snapshot"
	info "  Name it: $snapshot"
	info "  Wait until its Status says 'Available'."
	confirm "Is the snapshot Available?" || die "Stopped. Rerun this script once the snapshot is done."
	ok "Snapshot confirmed"
fi

step "2/2  Copy of the current server program"
if on_ec2 "test -f /opt/vaultfinal/server.prev"; then
	warn "A backup (/opt/vaultfinal/server.prev) already exists from an earlier run."
	info "If the server has been redeployed since then, that backup is the OLDER version — usually what you want to keep."
	if confirm "Replace it with the program that's running right now?"; then
		on_ec2 "sudo cp -p /opt/vaultfinal/server /opt/vaultfinal/server.prev"
		ok "Backup replaced"
	else
		ok "Kept the existing backup"
	fi
else
	on_ec2 "test -f /opt/vaultfinal/server" || die "/opt/vaultfinal/server doesn't exist on the instance. Is this the right server?"
	on_ec2 "sudo cp -p /opt/vaultfinal/server /opt/vaultfinal/server.prev"
	ok "Saved /opt/vaultfinal/server.prev"
fi

step "Backups done"
info "Next: ./deploy/scripts/02-migrate.sh"
