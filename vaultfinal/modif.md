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

## 4. CORS support for a cross-origin frontend (Phase 1)

**Date:** 2026-11-02

### What changed

The API now enforces an explicit CORS origin allowlist instead of being same-origin-only, so the Next.js frontend can be served from a different origin (e.g. `http://localhost:9002` during development, a production domain later) and still call this API with cookies.

- New `CORS_ALLOWED_ORIGINS` env var (comma-separated bare origins, `scheme://host[:port]`). Empty/unset is a no-op (today's same-origin deployment behavior is unchanged).
- New middleware wraps every route (`Routes()` now returns `s.CORS(mux)`): answers preflight `OPTIONS` requests, sets `Access-Control-Allow-Origin`/`-Credentials` for allowed origins, and rejects `POST` requests whose `Origin` header isn't on the allowlist (CSRF defense-in-depth).
- `decodeJSON` now requires `Content-Type: application/json`, closing the gap where a cross-site form POST under a non-preflighted Content-Type (`text/plain`, `multipart/form-data`, etc.) could reach the JSON decoder without ever triggering a CORS preflight.
- `*` is rejected outright as a value for `CORS_ALLOWED_ORIGINS` — this API authenticates with cookies, so a wildcard origin would defeat the point of the allowlist.
- In production (`APP_ENV=production`), every origin must be `https://`, **except `http://localhost`**, which is explicitly allowed so the deployed, production-mode server can still be exercised from a local frontend dev server over an SSH tunnel.

### Why

The frontend (`frontend-kp`, Next.js) and this API are deployed separately, so a browser request between them is cross-origin by default and the browser blocks it unless the API opts in via CORS headers.

### Files changed

- `internal/config/config.go` — added `AllowedOrigins []string` to `Config`; added `parseOrigins(raw string, isProd bool) ([]string, error)` with the validation rules above; wired into `Load()`.
- `internal/handlers/cors.go` (**new**) — the `Server.CORS` middleware.
- `internal/handlers/handlers.go` — `Routes()` now wraps the mux in `s.CORS(...)`; `decodeJSON` enforces `Content-Type: application/json`.
- `internal/handlers/handlers_test.go` — `TestDecodeJSONRejectsUnknownFields` updated to set `Content-Type` explicitly; added `TestDecodeJSONRejectsMissingContentType`, `TestDecodeJSONRejectsWrongContentType`, `TestCORSAllowedOriginPreflight`, `TestCORSDisallowedOriginPreflight`, `TestCORSDisallowedOriginPOSTRejected`, `TestCORSDisallowedOriginGETPassesThrough`, `TestCORSNoOriginHeaderPassesThroughUnchanged`.
- `deploy/fetch-secrets.sh` — writes `CORS_ALLOWED_ORIGINS=http://localhost:9002` into `/etc/vaultfinal/vaultfinal.env` on the server.
- `.env.example` — documents `CORS_ALLOWED_ORIGINS`.

### What did *not* change

- Same-origin deployments: with `CORS_ALLOWED_ORIGINS` unset, every request behaves exactly as before (middleware is a no-op).
- Cookie `SameSite` attribute — still `Lax`. Moving to `SameSite=None` is Phase 2, once the frontend is served from a real domain over HTTPS (a `Secure` cookie can't use `SameSite=None` over plain `http://localhost`).
- No `nginx`/TLS/domain changes — that's Phase 2.

### Verification

- `gofmt -l .`, `go build ./...`, `go vet ./...` all clean.
- `go test ./... -v -run "CORS|DecodeJSON"` — all new/modified tests pass.
- `go test ./...` — full existing suite passes unchanged.
- Not yet run against the live EC2 deployment (next step).
