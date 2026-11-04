#!/usr/bin/env bash
# rollback.sh — put the previous server program back.
#
#   ./deploy/scripts/rollback.sh                    # restore the old server program
#   ./deploy/scripts/rollback.sh --undo-migration   # also undo database migration 0005
#
# Undoing the migration is normally NOT needed: the old program works fine
# with the updated database. Only use it if you're told to.
source "$(dirname "$0")/lib.sh"
load_config

undo_migration=false
[ "${1:-}" = "--undo-migration" ] && undo_migration=true

step "Restoring the previous server program"
on_ec2 "test -f /opt/vaultfinal/server.prev" || die "No backup at /opt/vaultfinal/server.prev; nothing to restore."
confirm "Replace the running program with the backup (server.prev)?" || exit 0
on_ec2 "sudo install -o vaultapp -g vaultapp -m 755 /opt/vaultfinal/server.prev /opt/vaultfinal/server &&
        sudo systemctl restart medical-vault"
sleep 4
state="$(on_ec2 "systemctl is-active medical-vault || true")"
[ "$state" = "active" ] || die "The service is '$state' after restoring. See: ssh in and run  sudo journalctl -u medical-vault -n 50"
ok "Previous version restored and running"

if $undo_migration; then
	run_remote_script undo-migration.sh "${DB_OWNER:-}"
fi

step "Rollback done"
info "If the database itself is damaged, restore the snapshot from step 1 in the RDS console"
info "(this creates a new database instance; then point /vaultfinal/DATABASE_URL in SSM at it)."
