
# verify.sh — runs ON the instance (uploaded by 04-verify.sh).

step "Service status"
[ "$(systemctl is-active medical-vault || true)" = "active" ] || die "medical-vault is not running. See: sudo journalctl -u medical-vault -n 50"
sudo journalctl -u medical-vault --no-pager -o cat | grep 'listening on' | tail -n 1 | sed 's/^/       /'
ok "Running"
failed_audits="$(sudo journalctl -u medical-vault --since '-1 hour' --no-pager -o cat | grep -c 'audit: failed' || true)"
if [ "$failed_audits" -gt 0 ]; then
	warn "$failed_audits 'audit: failed to write' messages in the last hour. Audit rows aren't being saved:"
	sudo journalctl -u medical-vault --since '-1 hour' --no-pager -o cat | grep 'audit: failed' | tail -n 3 | sed 's/^/       /'
else
	ok "No audit write errors in the log"
fi

step "Calling the API directly (bypassing nginx)"
probe="VERIFY$(date +%s)"
expect() { # expect CODE METHOD PATH BODY DESCRIPTION
	local got
	got="$(curl -s -o /tmp/vault-verify.out -w '%{http_code}' -X "$2" "http://127.0.0.1:8080$3" \
		-H 'Content-Type: application/json' -d "$4")"
	if [ "$got" = "$1" ]; then
		ok "$5 -> $got $(cat /tmp/vault-verify.out)"
	else
		die "$5: expected $1, got $got $(cat /tmp/vault-verify.out)"
	fi
}
expect 401 POST /api/auth/login "{\"kitId\":\"$probe\",\"code\":\"000000\"}" "Login with an unknown KIT ID"
expect 401 POST /api/admin/provision '{"count":1}' "Admin endpoint without a session"
rm -f /tmp/vault-verify.out

step "Checking that the failed login was written to the audit log"
row="$(app_sql "SELECT event_type || ' / ' || (detail->>'reason') FROM audit_log WHERE principal = '$probe' ORDER BY id DESC LIMIT 1;")"
[ "$row" = "login_failed / unknown_kit_id" ] || die "Expected 'login_failed / unknown_kit_id' in audit_log, found '${row:-nothing}'."
ok "audit_log has: $row"
