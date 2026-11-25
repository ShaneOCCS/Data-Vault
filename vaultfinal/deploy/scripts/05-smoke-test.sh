#!/usr/bin/env bash
# Step 5 — test the whole deployed system end to end, the way the frontend
# will use it. Prints PASS/FAIL for each check.
#
#   ./deploy/scripts/05-smoke-test.sh               # goes through an SSH tunnel (tunnel.sh)
#   ./deploy/scripts/05-smoke-test.sh http://x/api  # or test a specific address
#
# It CREATES TEST DATA that can't be deleted through the app (the app has
# no delete permission by design): one test member with one record, and
# one test admin, which is disabled at the end.
source "$(dirname "$0")/lib.sh"
load_config
find_python

BASE="${1:-}"
CURL_TLS=()
if [ -z "$BASE" ]; then
	step "Connecting to the deployed API through an SSH tunnel"
	open_tunnel
	BASE="http://localhost:$TUNNEL_PORT/api"
	ok "Tunnel open"
fi

step "Smoke test against $BASE"
warn "This creates a test member (with one record) and a test admin. They stay in the database."
confirm "Continue?" || exit 0

ADMIN_EMAIL="${ADMIN_EMAIL:-}"
[ -n "$ADMIN_EMAIL" ] || read -rp "       Admin email: " ADMIN_EMAIL
read -rsp "       Password for $ADMIN_EMAIL (hidden): " ADMIN_PASSWORD
echo

work="$(mktemp -d)"
trap 'rm -rf "$work"; close_tunnel' EXIT
cd "$work" # relative file names keep curl happy on Windows

PASSES=0
FAILS=0
pass() {
	PASSES=$((PASSES + 1))
	printf '%s  PASS%s %s\n' "$GREEN" "$RESET" "$*"
}
fail() {
	FAILS=$((FAILS + 1))
	printf '%s  FAIL%s %s\n' "$RED" "$RESET" "$*"
}

# json BODY PATH — prints a value from a JSON body, e.g. json "$BODY" members.0.kitId
json() {
	"$PY" -c '
import json, sys
d = json.loads(sys.argv[1])
for k in sys.argv[2].split("."):
    d = d[int(k)] if isinstance(d, list) else d[k]
print(d)' "$1" "$2" 2>/dev/null || true
}
# secret_of OTPAUTH_URL — the TOTP secret inside an otpauth:// URL
secret_of() {
	"$PY" -c 'import sys, urllib.parse as u; print(u.parse_qs(u.urlsplit(sys.argv[1]).query)["secret"][0])' "$1"
}
# totp SECRET — the current 6-digit authenticator code (same as a phone app)
totp() {
	"$PY" -c '
import sys, base64, hmac, hashlib, struct, time
s = sys.argv[1].upper(); s += "=" * (-len(s) % 8)
h = hmac.new(base64.b32decode(s), struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
o = h[-1] & 15
print("%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7fffffff) % 1000000))' "$1"
}

# The login-type endpoints share a rate limit (5 quick tries, then 1 every
# 6 seconds per IP). The test spaces those calls out so it never hits it.
CRED_CALLS=0
pace() {
	CRED_CALLS=$((CRED_CALLS + 1))
	[ "$CRED_CALLS" -gt 3 ] && sleep 7
	return 0
}

# call METHOD PATH [JSON] [extra curl args...] — sets STATUS and BODY.
call() {
	local method="$1" path="$2" data="${3:-}"
	shift 3 2>/dev/null || shift $#
	local args=("${CURL_TLS[@]}" -s -o body.out -w '%{http_code}' -X "$method" "$BASE$path")
	[ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
	STATUS="$(curl "${args[@]}" "$@" || true)"
	BODY="$(cat body.out 2>/dev/null || true)"
}
# check EXPECTED_STATUS DESCRIPTION — compares the last call's status.
check() {
	if [ "$STATUS" = "$1" ]; then pass "$2"; else fail "$2 (expected $1, got $STATUS: $BODY)"; fi
}

echo
echo "${BOLD}Admin${RESET}"
pace
call POST /admin/auth/login "$("$PY" -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")" -c admin.jar
unset ADMIN_PASSWORD
check 200 "Admin login"
[ "$STATUS" = 200 ] || die "Can't continue without an admin login. Check ADMIN_EMAIL and the password."

call POST /admin/provision '{"count":1001}' -b admin.jar
check 400 "Provision 1001 members is rejected (limit is 1000)"

call POST /admin/provision '{"count":1}' -b admin.jar
check 201 "Provision 1 test member"
KIT="$(json "$BODY" members.0.kitId)"
SIGNUP="$(json "$BODY" members.0.recoveryKeys.0)"
REC1="$(json "$BODY" members.0.recoveryKeys.1)"
nkeys="$("$PY" -c 'import json,sys; print(len(json.loads(sys.argv[1])["members"][0]["recoveryKeys"]))' "$BODY" 2>/dev/null || echo 0)"
[ "$nkeys" = 4 ] && pass "Member got 4 keys (1 signup + 3 recovery)" || fail "Member got $nkeys keys, expected 4"
[ -n "$KIT" ] || die "No KIT ID in the provision response: $BODY"
info "Test member KIT ID: $KIT"

echo
echo "${BOLD}Member onboarding${RESET}"
pace
call POST /onboard/begin "{\"kitId\":\"$KIT\",\"recoveryKey\":\"$SIGNUP\"}"
check 200 "Start onboarding with the signup key"
SECRET="$(secret_of "$(json "$BODY" otpauthUrl)")"

pace
call POST /onboard/complete "{\"kitId\":\"$KIT\",\"code\":\"$(totp "$SECRET")\"}" -c member.jar
check 200 "Finish onboarding with an authenticator code"

pace
call POST /onboard/begin "{\"kitId\":\"$KIT\",\"recoveryKey\":\"$SIGNUP\"}"
check 401 "Reusing the signup key is refused"

call GET /session/me "" -b member.jar
check 200 "Member session works (/session/me)"

pace
call POST /auth/login "{\"kitId\":\"$KIT\",\"code\":\"$(totp "$SECRET")\"}" -c member.jar
check 200 "Member login with KIT ID + code"

echo
echo "${BOLD}Records${RESET}"
printf 'date,code,note\n2026-10-01,TEST,smoke test row\n' >"$KIT.csv"
call POST /admin/ingest "" -b admin.jar -F "kitId=$KIT" -F "file=@$KIT.csv"
check 201 "Upload a CSV for the member"

call GET /records "" -b member.jar
check 200 "Member lists their records"
RID="$(json "$BODY" records.0.id)"
call GET "/records/$RID" "" -b member.jar
check 200 "Member opens record $RID"
grep -q 'smoke test row' <<<"$BODY" && pass "Record content decrypts correctly" || fail "Record content not as expected: $BODY"

echo
echo "${BOLD}Lost-device recovery${RESET}"
pace
call POST /auth/recovery "{\"kitId\":\"$KIT\",\"recoveryKey\":\"$REC1\"}"
check 200 "Recovery with a recovery key gives a new authenticator setup"
SECRET="$(secret_of "$(json "$BODY" otpauthUrl)")"
pace
call POST /onboard/complete "{\"kitId\":\"$KIT\",\"code\":\"$(totp "$SECRET")\"}" -c member.jar
check 200 "Confirm the new authenticator"

echo
echo "${BOLD}New admin protections${RESET}"
TEST_ADMIN="smoke-$(date +%Y%m%d%H%M%S)@example.invalid"
call POST /admin/invites "{\"email\":\"$TEST_ADMIN\"}" -b admin.jar
check 201 "Invite a test admin"
TOKEN="$(json "$BODY" token)"

pace
call POST /admin/invites/accept "{\"email\":\"$TEST_ADMIN\",\"token\":\"$TOKEN\",\"password\":\"short\"}"
check 400 "Short password is refused on invite accept"

pace
call POST /admin/invites/accept "{\"email\":\"$TEST_ADMIN\",\"token\":\"$TOKEN\",\"password\":\"smoke-test-password-$RANDOM\",\"name\":\"Smoke Test Admin\"}" -c admin2.jar
check 200 "Same invite still works with a valid password"

call POST /admin/profile '{"name":"Renamed By Self"}' -b admin2.jar
check 200 "Test admin's session works"

info "Disabling the test admin directly in the database..."
app_sql "UPDATE admins SET active = false WHERE email = '$TEST_ADMIN';" >/dev/null
call POST /admin/profile '{"name":"Should Be Locked Out"}' -b admin2.jar
check 401 "Disabled admin is locked out immediately (same session)"

echo
echo "${BOLD}List endpoints${RESET}"
call GET /admin/admins "" -b admin.jar
check 200 "List admins (primary test admin's session)"

call GET /admin/members "" -b admin.jar
check 200 "List members (primary test admin's session)"

echo
echo "${BOLD}Audit log${RESET}"
events="$(app_sql "SELECT string_agg(DISTINCT event_type, ',') FROM audit_log WHERE principal IN ('$KIT', '$TEST_ADMIN');")"
for e in member_provisioned onboard_begin onboard_complete onboard_begin_failed ingest recovery admin_invite_accepted admin_session_failed; do
	[[ ",$events," == *",$e,"* ]] && pass "audit_log has $e" || fail "audit_log is missing $e"
done

echo
if [ "$FAILS" -eq 0 ]; then
	printf '%s%s All %d checks passed.%s\n' "$GREEN" "$BOLD" "$PASSES" "$RESET"
	info "Test member: $KIT    Test admin (disabled): $TEST_ADMIN"
else
	printf '%s%s %d of %d checks failed.%s\n' "$RED" "$BOLD" "$FAILS" "$((PASSES + FAILS))" "$RESET"
	exit 1
fi
