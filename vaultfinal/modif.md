# Modifications Log

## 1. Members now get 4 keys: 1 signup + 3 recovery

**Date:** 2026-10-07

### What changed

When an admin provisions a member (`POST /api/admin/provision`), the member now receives **4 keys instead of 3**:

| Purpose | Before | After | What it's for |
|---|---|---|---|
| `signup` | 1 | 1 | Used once at `POST /api/onboard/begin` to set up the authenticator app for the first time. |
| `recovery` | 2 | **3** | Each one can be used once at `POST /api/auth/recovery` to set up a new authenticator after the member loses their device. |

The provision response now contains four keys per member, and the signup key is still first:

```json
{
  "members": [
    {
      "kitId": "AB3CD7K",
      "recoveryKeys": ["<signup>", "<recovery-1>", "<recovery-2>", "<recovery-3>"]
    }
  ]
}
```

### Why

Each lost device uses up one recovery key. With only 2, a member who lost their phone twice was locked out until an admin issued more keys through `POST /api/admin/members/{kitId}/recovery-keys`. A third key gives members one more chance to recover on their own before they need an admin. Purposes are still separate (invariant #4): a recovery key cannot complete first enrollment, and the signup key cannot be used for recovery.

### Files changed

**`internal/handlers/admin.go`**
- Added two named constants so the per-member key counts are defined in one place instead of as literal numbers in the code:
  ```go
  const (
      signupKeysPerMember   = 1
      recoveryKeysPerMember = 3
  )
  ```
- `provisionOneMember` now calls `auth.GenerateRecoveryKeys(auth.RecoveryPurposeRecovery, recoveryKeysPerMember)`, which was `..., 2)` before. The signup call uses `signupKeysPerMember`.
- Updated the comments to match:
  - `maxProvisionBatchCount`: each member now costs **4** bcrypt hashes, not 3.
  - `provisionOneMember`: "4 recovery keys (1 signup + 3 recovery)".
  - `TopUpRecoveryKeys`: an admin top-up is needed after the member has used their original **3** keys.

**`internal/store/store.go`**
- Comment on `GetUnusedRecoveryKeys`: "4 total minted" instead of "3 total minted". The query is unchanged.

**`FEATURES.md`**
- Section 4 (Member provisioning) now describes 1 signup + 3 recovery keys and shows the new response example.

### What did *not* change

- **Database schema and migrations.** `recovery_keys` has no limit on keys per member, so no migration is needed.
- **Existing members.** Members provisioned before this change still have 2 recovery keys. To give one of them a third key, an admin can call `POST /api/admin/members/{kitId}/recovery-keys` with `{"count": 1}`.
- **Redemption logic.** `OnboardBegin`, `Recovery` and `matchRecoveryKey` already loop over every unused key of the right purpose, so they handle 3 recovery keys without changes.
- **Top-up limit.** `maxRecoveryKeyTopUp` is still 10.

### Cost / impact

- Each provisioned member now costs one more bcrypt hash (about 25% more CPU per member). A full batch of 200 members goes from 600 hashes to 800. The 200-member limit per request stays the same.
- **Response format:** API clients that assumed exactly 3 keys, or that every key after the first is a recovery key, should still work, because the signup key is still at index 0. Any client that hard-codes an array length of 3 needs to be updated.

### Verification

- `go build ./...` passes.
- `go vet ./...` passes.
- The repo has no automated tests, so the new behavior has not been tested by running the server.

---

## 2. Admins can provision up to 1000 KIT IDs per request (was 200)

**Date:** 2026-10-07

### What changed

`POST /api/admin/provision` now accepts `{"count": N}` with `1 ≤ N ≤ 1000`. The old upper limit was 200. The minimum is still 1.

| | Before | After |
|---|---|---|
| Max members per request (`maxProvisionBatchCount`) | 200 | **1000** |
| Max bcrypt hashes per request (4 per member) | 800 | **4000** |
| 400 error message | `count must be an integer between 1 and 200` | `count must be an integer between 1 and 1000` |

### Why

Admins wanted to create larger cohorts of KIT IDs in a single request instead of splitting them into batches of 200.

### Files changed

**`internal/handlers/admin.go`**
- `maxProvisionBatchCount` changed from `200` to `1000`.
- The validation error in `Provision` used to hard-code "200". It is now built from the constant (`fmt.Sprintf("count must be an integer between 1 and %d", maxProvisionBatchCount)`), so the message can't fall out of sync with the limit again. This adds the `fmt` import.

**`FEATURES.md`**
- Section 4 (Member provisioning) now says `1 ≤ N ≤ 1000`.

### What did *not* change

- **Database schema and migrations.** No migration is needed.
- **KIT ID format and collision handling.** IDs are still 7 characters from a 31-symbol alphabet (about 27.5 billion possible IDs), and there are still up to 5 retries on a collision. 1000 more IDs per request makes no real difference to the collision rate.
- **Keys per member.** Still 1 signup + 3 recovery.
- **Partial-failure behavior.** There is still no transaction. Members created before a failure stay in place.
- **Server timeouts.** `WriteTimeout` is still 30s (`cmd/server/main.go`).

### Cost / impact

- **A full batch probably won't finish within the HTTP timeouts.** Every member costs 4 bcrypt hashes at `bcrypt.DefaultCost` (10), so 1000 members means 4000 hashes, run one after another. At a typical ~50–100 ms per hash, that is roughly **3–7 minutes** for one request. This is an estimate and was not measured on the target EC2 instance. It is far longer than the server's 30s `WriteTimeout` and nginx's default 60s `proxy_read_timeout`. The handler keeps running and creating members, but the client may get a timeout or empty response instead of the JSON. **That JSON is the only place the plaintext recovery keys appear**, so members created this way would exist without their keys reaching the admin. Those members would need new recovery keys through `POST /api/admin/members/{kitId}/recovery-keys`, and their signup key can't be reissued that way.
  - Until the timeouts or the provisioning flow are changed, the safe batch size is roughly the same as before (about 200 or less). Larger counts are now *allowed* but not guaranteed to complete cleanly.
- **CPU per request:** up to 5× more bcrypt work than before for one request, and the endpoint is not rate-limited (it is admin-only).

### Verification

- `go build ./...` passes.
- `go vet ./...` passes.
- The repo has no automated tests, and a 1000-member request has not been run against a live server.

---

## 3. Resolved the code observations (except AWS details and the listen address)

**Date:** 2026-10-07

This entry fixes seven of the nine items in `FEATURES.md` section 22. As requested, two are **not** touched: the all-interfaces listen address in `cmd/server` and the AWS account ID / KMS ARN in `deploy/iam-permissions-policy.json`.

### 3.1 Single-use checks could race

**Problem:** Recovery keys and invites were read first and marked used afterwards, with an unconditional `UPDATE ... WHERE id = $1`. Two requests at the same moment could both redeem the same key or token.

**Fix:** Marking a key or invite used is now an atomic claim. The UPDATE only matches a row that is still unused, so Postgres lets exactly one request flip it:

```sql
UPDATE recovery_keys SET used_at = now() WHERE id = $1 AND used_at IS NULL
```

- **Store layer:** if no row was updated, the store returns a new `store.ErrAlreadyUsed`.
- **Handlers:** onboard/begin and recovery go through a new shared `claimRecoveryKey` helper. A request that loses the race gets the same generic 401 as a wrong key (invariant #6) and is audited with reason `key_already_used`.
- **Invites:** the invite claim also re-checks `expires_at > now()`, so an invite that expires between the token check and the claim can't be used.

### 3.2 A failed accept could waste the invite

**Problem:** `AcceptInvite` marked the invite used *before* `InsertAdmin`. If the insert failed (for example, the email was already an admin), the invite was spent and no account was created.

**Fix:** New `store.AcceptInviteAndCreateAdmin` claims the invite and inserts the admin in **one transaction**. If the insert fails, the claim is rolled back.

- An email that is already an admin now gets **409** `an admin account with this email already exists`, and the invite stays unspent. Only someone holding a valid token for that exact email can reach this response, so it reveals nothing to anyone else.
- `store.InsertAdmin` now returns the sentinel `store.ErrDuplicateAdminEmail` instead of a wrapped driver error.
- `store.MarkInviteUsed` was removed; nothing else used it.

### 3.3 No password policy on invite accept

**Fix:** There is now one policy, `auth.ValidateAdminPassword`, used by both `cmd/bootstrap-admin` and `AcceptInvite`:

- **Minimum:** 12 characters, counted as characters rather than bytes, so non-ASCII passwords aren't penalized.
- **Maximum:** 72 bytes. That is bcrypt's input limit. Before, a longer password made `bcrypt.GenerateFromPassword` fail and the request returned a 500.

`AcceptInvite` checks the password **before** looking up the invite, so a rejected password (400) never consumes or probes the invite.

### 3.4 No revocation for admin sessions

**Problem:** A disabled admin's JWT stayed valid for up to 8h, because nothing re-checked `active`.

**Fix:** `RequireAdminSession` now re-reads the admin row on every request, after verifying the JWT. A new `adminAllowed` check rejects the session if the admin doesn't exist, is inactive or doesn't have a permitted role. On rejection the middleware:

- returns the generic 401;
- clears the admin cookie;
- writes an `admin_session_failed` audit row.

`AdminLogin` uses the same `adminAllowed` check. It now checks the password *before* the account status, so the status reason is only recorded for someone who knows the password.

**Cost:** one lookup on the unique `admins.email` index per admin request.

**Not changed:** member sessions are still stateless and can't be revoked. That wasn't one of the observations.

### 3.5 Failed auth attempts weren't audited, and audit write errors were ignored

**Fix:**

- **Failure audits:** every rejected credential attempt now writes an `<event>_failed` audit row with an internal-only `{"reason": ...}`. The full list of events and reasons is in `FEATURES.md` section 15. The client response is unchanged (the same generic 401). The principal is whatever KIT ID or email was submitted.
- **Long principals:** `store.LogAudit` cuts the principal to the column's 64-character limit. Before, an over-long submitted value would have made the audit insert itself fail.
- **Write errors:** all audit writes now go through `Server.audit`. They stay best-effort and never fail the request, because the action has already happened and failing the response could hide its result (such as one-time provision keys). But a failed write is now **logged** with `log.Printf` instead of discarded. `record_access_log` writes get the same treatment.
- **Client disconnects:** audit writes use `context.WithoutCancel`, so a client that disconnects right after an attempt can't also cancel that attempt's audit row.

**Still not audited:** 429 responses from the rate limiter (the limiter has no store access), requests with a missing or invalid session cookie (too noisy), and 400 validation errors.

### 3.6 `admins.role` was never read

**Fix:**

- **Code:** `auth.AdminRoleSuperadmin` is the only role that exists, and `adminAllowed` requires it at login and on every admin request. Any other value is **denied**, not treated as full access. A future lesser role therefore can't inherit everything before the code that limits it exists.
- **Database:** new migration `0005_admin_role_check.sql` adds `CHECK (role IN ('superadmin'))`, so a typo'd role can't be stored. Adding a role later means extending both the constraint and `adminAllowed`.

### 3.7 No tests and no migration runner

**Migration runner:** new `cmd/migrate` (logic in `internal/migrate`; SQL files embedded by `migrations/migrations.go`). The commands are `migrate up`, `migrate status` and `migrate baseline <version>`.

- **Bookkeeping:** applied versions are recorded in a new `schema_migrations` table.
- **Transactions:** each file runs in its own transaction together with its bookkeeping row, so a failing file leaves nothing behind.
- **Locking:** a Postgres advisory lock serializes concurrent runs.
- **Strict filenames:** names must be `NNNN_name.sql` with unique numbers. Anything else is an error.
- **Role:** the runner must connect as the database owner, not `vaultapp`.

**Tests:** 74 tests and subtests.

| Package | What's covered | Needs DB |
|---|---|---|
| `auth` | KIT ID and recovery key format, hashing, password policy, member/admin token confusion, wrong key, `alg=none`, expiry, TOTP | no |
| `config` | Valid dev/prod configs, plus every rejection rule including invariant #8 | no |
| `crypto` | `LocalEncryptor` round trip, fresh nonces, tamper, wrong key, short blob | no |
| `ingestion` | Filename guard, ragged CSV rows, column order, encode/decode | no |
| `ratelimit` | Burst then 429, per-IP buckets, `X-Forwarded-For` | no |
| `migrate` | Filename validation, up and re-run, baseline flow for hand-migrated DBs, rollback of a failing file | partly |
| `store` | Concurrent key claim (20 goroutines → exactly 1 wins), concurrent invite accept, duplicate-admin accept keeps the invite, expired invite, audit principal cut-off, role constraint | yes |
| `handlers` | Disabled/deleted admin rejected mid-session, disabled admin can't log in, invite password policy, 409 keeps the invite, failure audits, 10 concurrent onboard/begin calls with one signup key → exactly 1 succeeds, audit write failure doesn't fail the request | partly |

- **Setup:** DB tests use `internal/testdb`, which creates a uniquely named, fully migrated database per test and drops it afterwards. They are **skipped** unless `VAULT_TEST_DATABASE_URL` points at a throwaway Postgres where the role can create databases and roles.
- **Checking the race test:** I temporarily removed the `AND used_at IS NULL` guard. The recovery-key race test then failed with "20 concurrent claims succeeded, want exactly 1". With the guard back, it passes.

### Files changed

| File | Change |
|---|---|
| `internal/store/store.go` | Conditional `MarkRecoveryKeyUsed`. New `AcceptInviteAndCreateAdmin` (transaction). New sentinels `ErrAlreadyUsed` and `ErrDuplicateAdminEmail`. Principal cut-off in `LogAudit`. Removed `MarkInviteUsed`. |
| `internal/auth/password.go` | `ValidateAdminPassword`, `MinAdminPasswordLength`, `MaxAdminPasswordBytes`. |
| `internal/auth/admin_session.go` | `AdminRoleSuperadmin`. |
| `internal/handlers/handlers.go` | `audit` and `auditFailure` helpers. |
| `internal/handlers/middleware.go` | Per-request admin re-check and `rejectAdminSession`. |
| `internal/handlers/admin_auth.go` | `adminAllowed`, password-first ordering, failure audits. |
| `internal/handlers/admin_invite.go` | Password policy, transactional accept, 409, failure audits. |
| `internal/handlers/onboard.go`, `auth.go` | `claimRecoveryKey` and failure audits. |
| `internal/handlers/admin.go`, `records.go` | Audit and record-access writes go through the logging path. |
| `cmd/bootstrap-admin/main.go` | Uses `auth.ValidateAdminPassword`. |
| `cmd/migrate/main.go`, `internal/migrate/migrate.go`, `migrations/migrations.go` | **New:** migration runner. |
| `internal/testdb/testdb.go` | **New:** integration test helper. |
| `migrations/0002_roles.sql` | `CREATE ROLE` guarded with `IF NOT EXISTS` (roles are cluster-wide). No effect on databases that already have the roles. |
| `migrations/0005_admin_role_check.sql` | **New:** role CHECK constraint. |
| `*_test.go` (8 files) | **New:** tests. |
| `FEATURES.md` | Sections 1, 5, 7, 9–12, 15, 18, 20, 21 and 22 updated. |

### Deploying this

1. **Baseline existing databases once** (they were migrated by hand), then apply `0005`. Run as the DB owner, not `vaultapp`:
   ```sh
   DATABASE_URL=<owner url> ./migrate baseline 0004_admin_invites
   DATABASE_URL=<owner url> ./migrate up
   ```
   `0005` fails if any existing admin row has a role other than `superadmin`. None should exist, because `superadmin` is the default and nothing ever set another value.
2. **Deploy the server.** `deploy/deploy.sh` only builds `cmd/server`. Build `cmd/migrate` separately, or run it with `go run` from a machine that can reach RDS. I did not change the deploy scripts.

### Behavior changes clients may notice

- `POST /api/admin/invites/accept` can now return **400** (password policy) and **409** (admin exists), in addition to 200/401.
- Any admin request from a disabled admin now returns 401 right away and clears the cookie, instead of working until the token expires.
- `audit_log` grows faster, by one row per failed credential attempt. The rate limiter caps this at about 10 per minute per IP.

### Still open

- The listen address and the AWS details (excluded as requested).
- The provisioning timeout risk from entry #2 is not addressed by this entry.

### Verification

- `go build ./...` and `go vet ./...` pass.
- `go test ./...` with `VAULT_TEST_DATABASE_URL` set to a throwaway local PostgreSQL 18 cluster: all 74 tests pass, none skipped.
- Without `VAULT_TEST_DATABASE_URL`, the unit tests pass and the DB tests are skipped.
- `go run ./cmd/migrate status | up | up | baseline 9999_x` was run against a scratch database. It listed all files as pending, applied 0001–0005, reported "up to date" on the second run and rejected the unknown version.
- The race detector (`-race`) was **not** run, because this Windows machine has no cgo toolchain.
- The changes have not been run on the EC2/RDS deployment.

---

## 4. Deployment scripts, and an audit-log fix for IPv6 clients

**Date:** 2026-10-07

### What changed

**1. Every command-line step of the deployment is now a script**, in `deploy/scripts/`. You run each one from your own computer in Git Bash; the scripts connect to the server themselves. `deploy/deploy.md` was rewritten around them in plain language.

**Not included, on purpose:**
- **HTTPS.** There is no public HTTPS address. The deployed API is reached through the SSH tunnel, and HTTPS can be added later.
- **CORS.** The frontend technology isn't confirmed yet, so no frontend wiring was added. `CORS.md` (new) documents what the backend needs (allowed-origins setting, middleware, cookie `SameSite` and CSRF rules) and what the frontend must send, for when it's time. **No CORS code was added.**

| Script | Purpose |
|---|---|
| `00-check.sh` | Checks settings, tools, build/tests and SSH/sudo access. Changes nothing. |
| `01-backup.sh` | RDS snapshot (automatic with the AWS CLI, or guided in the console) and `server.prev` copy of the running program. |
| `02-migrate.sh` | Builds `cmd/migrate`, runs it **on the instance** as the DB owner (password asked there, hidden, never stored), and baselines a hand-migrated database on first run. |
| `03-deploy.sh` | Refuses to run without a backup, installs the new program, restarts it and checks it started. |
| `04-verify.sh` | On-box checks: service and log, 401s from the API, failed login present in `audit_log`, port 8080 closed to the internet. |
| `05-smoke-test.sh` | 28 end-to-end PASS/FAIL checks, including the new protections and the audit log. Runs through an SSH tunnel (or against an address passed as an argument). |
| `tunnel.sh` | Makes the deployed API reachable at `http://localhost:18080/api` through SSH. Session cookies work there because it's `localhost`, and port 8080 stays closed to the internet. |
| `rollback.sh` | Restores `server.prev`; `--undo-migration` also reverts 0005. |

**Supporting files:**
- `deploy/scripts/lib.sh` and `deploy/scripts/remote/*.sh`: shared helpers, plus the parts that run on the instance.
- `deploy/deploy.env.example`: the settings template.
- `deploy/.gitattributes`: keeps `*.sh` files at LF line endings so they run on Windows and Linux.

**How the scripts handle secrets:**
- Database passwords are passed to `psql` and the migration tool through environment variables, never on a command line.
- The app's connection string is read from `/etc/vaultfinal/vaultfinal.env` with `grep`, not by sourcing the file, so special characters in the password can't break it.

**2. Bug fix: audit writes failed for IPv6 clients without a proxy.** `clientIP` cut the port off `RemoteAddr` at the last colon. For an IPv6 address like `[::1]:5555`, that left `[::1]`, which Postgres rejects for the `inet` column, so the audit row was not written.

It now uses `net.SplitHostPort`, the same way the rate limiter already did.

- **Who it affected:** only requests reaching the app directly over IPv6. Behind nginx, `X-Forwarded-For` already holds a plain address, so the AWS deployment was not affected.
- **How it was found:** the audit-error logging added in entry #3 printed it while the smoke test ran against a local server.

### Files changed

- `internal/handlers/handlers.go`: `clientIP` uses `net.SplitHostPort`.
- `internal/handlers/handlers_test.go`: IPv6 case added to `TestClientIP`.
- `deploy/deploy.md`: rewritten.
- **New:** `CORS.md` (guide only, no code).
- **New:** `deploy/scripts/` (8 scripts, `lib.sh`, `remote/`), `deploy/deploy.env.example`, `deploy/.gitattributes`.
- `deploy/deploy.sh` is unchanged. `03-deploy.sh` replaces it but adds the backup check and the start-up check.

### Verification

- `go build`, `go vet` and `go test ./...` pass.
- All scripts pass `bash -n` and contain no CRLF line endings.
- **Smoke test:** `05-smoke-test.sh` was run against a local server and a local PostgreSQL 18 database with all migrations applied: **28/28 checks passed**. The first run found the IPv6 bug above (8 audit checks failed, with `invalid input syntax for type inet: "[::1]"` in the log); after the fix, all checks pass with zero audit write errors.
- **Migration script:** `remote/migrate.sh` was run against a local database migrated by hand, the same situation as RDS. It baselined 0001–0004 and applied only 0005.
- **URL helpers:** the connection-string helpers were checked with a password containing `@ : / ? # % &`.
- **Tunnel mode:** the smoke test was also run in tunnel mode, with `ssh` replaced by a stand-in that serves the app on the tunnel port. It opened the tunnel, passed 28/28 checks and closed the tunnel afterwards.
- **Not tested here:** the SSH and systemd parts. They need the real EC2 instance, and there was no Linux test machine available (no Docker or shellcheck on this computer). They'll be exercised the first time you run steps 0–5.
