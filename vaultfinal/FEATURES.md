# Medical Vault: Features and How They Work

This is a Go backend (`module vaultfinal`, Go 1.25) that stores pseudonymized medical records. Members log in with a **KIT ID** and a **TOTP code**. They never use a password and never give their name. Admins create members, give them their credentials and upload CSV record exports. All sensitive data is encrypted at rest.

- **Stack:** stdlib `net/http` (Go 1.22+ method/pattern mux), PostgreSQL via `pgx/v5`, JWT (`golang-jwt/v5`), TOTP (`pquerna/otp`), bcrypt (`x/crypto`), AWS KMS (`aws-sdk-go-v2`), rate limiting (`x/time/rate`).
- **Entrypoints:** `cmd/server` (the HTTP API), `cmd/bootstrap-admin` (a one-time CLI that creates the first admin) and `cmd/migrate` (applies the SQL migrations).

---

## Table of contents

1. [Architecture and layering](#1-architecture-and-layering)
2. [Configuration and startup checks](#2-configuration-and-startup-checks)
3. [Encryption at rest](#3-encryption-at-rest)
4. [Member provisioning (batch)](#4-member-provisioning-batch)
5. [Member onboarding (first enrollment)](#5-member-onboarding-first-enrollment)
6. [Member login](#6-member-login)
7. [Lost-device recovery](#7-lost-device-recovery)
8. [Recovery key top-up](#8-recovery-key-top-up)
9. [Sessions (member and admin)](#9-sessions-member-and-admin)
10. [Admin bootstrap](#10-admin-bootstrap)
11. [Admin login and logout](#11-admin-login-and-logout)
12. [Admin invites](#12-admin-invites)
13. [CSV ingestion of medical records](#13-csv-ingestion-of-medical-records)
14. [Viewing records](#14-viewing-records)
15. [Audit logging](#15-audit-logging)
16. [Rate limiting](#16-rate-limiting)
17. [Error handling and anti-enumeration](#17-error-handling-and-anti-enumeration)
18. [Database schema and least-privilege roles](#18-database-schema-and-least-privilege-roles)
19. [Deployment](#19-deployment)
20. [API reference](#20-api-reference)
21. [Security invariants (as referenced in code)](#21-security-invariants-as-referenced-in-code)
22. [Observations and gaps](#22-observations-and-gaps)

---

## 1. Architecture and layering

| Package | Responsibility |
|---|---|
| `cmd/server` | Builds every dependency once at startup (config, DB pool, encryptor, session managers) and runs the HTTP server with graceful shutdown. |
| `cmd/bootstrap-admin` | A CLI that writes the first admin straight to the DB. |
| `cmd/migrate` | A CLI that applies the embedded SQL migrations and records them in `schema_migrations` (section 18). |
| `internal/config` | The **only** place that reads environment variables. It validates them and returns a typed `Config`. |
| `internal/crypto` | The `Encryptor` interface, with `LocalEncryptor` (dev) and `KMSEncryptor` (prod). |
| `internal/auth` | Pure credential logic: TOTP, recovery keys, KIT IDs, passwords, invite tokens and the JWT session managers. No DB or HTTP. |
| `internal/handlers` | HTTP handlers, routing, middleware and response helpers. Handlers decide *what* happens and call other packages to do it. |
| `internal/store` | The **only** package that contains SQL (invariant #7). It returns plain structs. |
| `internal/ingestion` | CSV parsing and row encoding/decoding. No DB or crypto. |
| `internal/ratelimit` | In-memory token bucket per IP. |
| `internal/migrate` | The migration runner used by `cmd/migrate` and the tests. It contains schema-management SQL and is never imported by the server. |
| `internal/testdb` | Test helper that creates a fresh, migrated Postgres database per test. |
| `migrations/` | Numbered SQL schema and role migrations, embedded into `cmd/migrate` by `migrations.go`. |
| `deploy/` | EC2, systemd, nginx, SSM and IAM artifacts. |

**Startup sequence** (`cmd/server/main.go`):
1. `signal.NotifyContext` catches SIGINT and SIGTERM so shutdown is graceful.
2. `config.Load()` runs. Any error stops startup with `log.Fatalf`.
3. `pgxpool.New`, then `Ping`.
4. `buildEncryptor` picks the local or KMS encryptor based on `USE_KMS`.
5. `store.New`, both session managers and `handlers.NewServer`.
6. `http.Server` starts with timeouts: Read 10s, Write 30s, Idle 60s.
7. On a signal, `Shutdown` runs with a 15s deadline.

---

## 2. Configuration and startup checks

**File:** `internal/config/config.go`, with a template in `.env.example`.

| Var | Default | Rule |
|---|---|---|
| `PORT` | `8080` | |
| `APP_ENV` | `development` | Must be `development` or `production`. |
| `DATABASE_URL` | none | Required. |
| `SESSION_KEY` | none | Required. Base64 that decodes to **at least 32 bytes**. Signs both member and admin JWTs. |
| `USE_KMS` | `false` | Must parse as a bool. |
| `KMS_KEY_ID` | none | Required when `USE_KMS=true`. |
| `LOCAL_ENCRYPTION_KEY` | none | Required when `USE_KMS=false`. Base64 that decodes to **exactly 32 bytes**. |
| `TOTP_ISSUER` | `Medical Vault` | The label shown in authenticator apps. |

**Key rule (invariant #8):** `APP_ENV=production` together with `USE_KMS=false` is rejected at startup. This means the static dev key can never be used in front of real data.

---

## 3. Encryption at rest

**File:** `internal/crypto/crypto.go`

Callers only see the `Encryptor` interface (`Encrypt` / `Decrypt` returning opaque blobs).

**What gets encrypted:** member TOTP secrets (`members.totp_secret_enc`) and every medical record row (`medical_records.content_enc`).

### LocalEncryptor (dev only)
- AES-256-GCM using the static `LOCAL_ENCRYPTION_KEY`.
- Each call uses a fresh random nonce, which is prepended to the output. Blob layout: `[nonce][ciphertext||tag]`.

### KMSEncryptor (production)
- **Envelope encryption:** each `Encrypt` call asks KMS `GenerateDataKey` (AES_256) for a new data key and seals the data locally with AES-GCM.
- Blob layout: `[4-byte BE len(wrappedKey)][wrappedKey][nonce][ciphertext||tag]`.
- `Decrypt` reads the length prefix, unwraps the data key with KMS `Decrypt`, then opens the GCM payload.
- The plaintext data key is never stored. The IAM policy only needs `kms:GenerateDataKey` and `kms:Decrypt` on one CMK.
- Cost: every encrypt and every decrypt makes one KMS call (no data-key caching).

---

## 4. Member provisioning (batch)

**Endpoint:** `POST /api/admin/provision` (requires an admin session)
**Handler:** `handlers/admin.go` `Provision` → `provisionOneMember`

Request: `{"count": N}` where `1 ≤ N ≤ 1000` (`maxProvisionBatchCount`, which limits bcrypt work per request).

For each member:
1. **KIT ID generation** (`auth.GenerateKitID`): 7 characters drawn with `crypto/rand` from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. The alphabet leaves out 0/O/1/I/L so IDs are easier to read.
2. **Collision handling:** the handler inserts the ID and retries on `store.ErrDuplicateKitID` (Postgres SQLSTATE 23505), up to 5 retries (`kitIDGenerationRetries`).
3. **Recovery keys:** 1 `signup`-purpose key and 3 `recovery`-purpose keys (`signupKeysPerMember` / `recoveryKeysPerMember`). Format: four 5-character segments joined by hyphens, from a 56-character mixed-case alphabet.
4. Keys are bcrypt-hashed and batch-inserted with `pgx.Batch`. **Plaintext keys appear only in this response.**
5. One `member_provisioned` audit row is written **per member**, with `actor_admin_email` set.

Response `201`: `{"members":[{"kitId":"...","recoveryKeys":["signup","recovery","recovery","recovery"]}]}`. The first key is the signup key.

**Partial failure:** the loop is intentionally not wrapped in a transaction. Members that were already created stay in place, and the admin requests the rest again.

New members start with `registered=false` and `totp_secret_enc=NULL`.

---

## 5. Member onboarding (first enrollment)

**Endpoints:** `POST /api/onboard/begin` and `POST /api/onboard/complete` (both rate-limited)
**File:** `handlers/onboard.go`

### Begin: `{kitId, recoveryKey}`
1. Load the member's **unused `signup`-purpose** keys (`GetUnusedRecoveryKeys`, backed by a partial index).
2. bcrypt-compare the submitted key against each one (`matchRecoveryKey`). A recovery-purpose key does not match here (invariant #4).
3. If none matches, return the generic 401.
4. Mark the matched key as used. This is an **atomic claim**: the UPDATE only matches a key whose `used_at` is still NULL. If a concurrent request already spent it, this request gets the generic 401 (`claimRecoveryKey`).
5. `beginEnrollment`: generate a TOTP secret (issuer = `TOTP_ISSUER`, account = KIT ID), encrypt it and save it to the member row.
6. Audit `onboard_begin`. Return `{"otpauthUrl": "otpauth://..."}`, which the frontend renders as a QR code.

### Complete: `{kitId, code}`
1. Load the member. If it doesn't exist or has no pending secret, return the generic 401.
2. Decrypt the secret and verify the TOTP code (SHA1, 6 digits, 30s period, skew ±1 step).
3. Set `registered=true`, issue a member session cookie and audit `onboard_complete`.
4. Return `{"kitId": "..."}`.

The same `complete` endpoint also finishes lost-device recovery (section 7).

---

## 6. Member login

**Endpoint:** `POST /api/auth/login` (rate-limited)
**File:** `handlers/auth.go` `Login`

Request: `{kitId, code}`.
1. If the member is unknown, not registered, or has no secret, return the generic 401.
2. Decrypt the TOTP secret and verify the code. A wrong code returns the generic 401.
3. Issue the member JWT, set the `vault_session` cookie and audit `login`.

Members have **no password** (invariant #3). Their factors are the KIT ID plus possession of the authenticator.

---

## 7. Lost-device recovery

**Endpoint:** `POST /api/auth/recovery` (rate-limited)
**File:** `handlers/auth.go` `Recovery`

Request: `{kitId, recoveryKey}`.
1. Only **unused `recovery`-purpose** keys are accepted. The signup key does not work here.
2. On a match, atomically claim the key (same `claimRecoveryKey` as onboarding, so two concurrent requests can't both redeem it) and call the shared `beginEnrollment`, which generates and stores a **new** TOTP secret. The old secret is overwritten.
3. Audit `recovery`. Return `{"otpauthUrl": ...}`, the same response shape as onboard/begin.
4. The member scans the new QR code and calls `POST /api/onboard/complete` to confirm and get a session.

The handler does not reset `registered=false`, because the signup key is already spent and `/onboard/begin` would reject the member.

---

## 8. Recovery key top-up

**Endpoint:** `POST /api/admin/members/{kitId}/recovery-keys` (requires an admin session)
**Handler:** `TopUpRecoveryKeys`

Request: `{"count": N}` with `1 ≤ N ≤ 10`. The member must exist (otherwise 404). This endpoint creates **only `recovery`-purpose** keys and never signup keys. The keys are hashed, stored and returned once. Audit: `recovery_keys_topped_up` with `{count}`.

---

## 9. Sessions (member and admin)

**Files:** `auth/session.go`, `auth/admin_session.go`, `handlers/middleware.go`

| | Member | Admin |
|---|---|---|
| Cookie | `vault_session` | `vault_admin_session` |
| TTL | 12h | 8h |
| Claims | `kitId`, `typ:"member"` | `email`, `typ:"admin"` |
| Middleware | `RequireSession` | `RequireAdminSession` |

- Both are HS256 JWTs signed with `SESSION_KEY`. They use **separate claim structs and a `typ` check**, so a member token is rejected on admin routes and an admin token is rejected on member routes.
- Parsing rejects any signing method other than HMAC (protects against algorithm confusion).
- Cookies are `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`.
- The middleware puts the KIT ID or admin email into the request context (unexported `ctxKey` type). **Record handlers only take the KIT ID from the session, never from request input** (invariant #5).
- **Member sessions** are stateless JWTs. There is no server-side revocation, so member logout only clears the cookie.
- **Admin sessions are checked against the database on every request.** `RequireAdminSession` re-reads the admin row and rejects the session if the admin no longer exists, is inactive (`active=false`) or doesn't have the `superadmin` role (`adminAllowed`). Disabling an admin therefore revokes their existing sessions immediately. A rejected session gets the generic 401, its cookie is cleared, and an `admin_session_failed` audit row is written.

---

## 10. Admin bootstrap

**Command:** `cmd/bootstrap-admin` (`go run ./cmd/bootstrap-admin --email you@x.com [--password ...]`)

- Connects straight to `DATABASE_URL`, checks the password with `auth.ValidateAdminPassword` (12–72 characters, the same policy as invite accept), bcrypt-hashes it and calls `store.InsertAdmin`.
- If `--password` is left out, the command prompts on stdin. **Terminal echo is not turned off**, so run it over a trusted SSH session.
- No HTTP endpoint creates an admin from a shared secret (invariant #9). Admins are created only by this CLI or through an invite.

---

## 11. Admin login and logout

**Endpoints:** `POST /api/admin/auth/login` (rate-limited) and `POST /api/admin/auth/logout` (requires an admin session)
**File:** `handlers/admin_auth.go`

- Login: `{email, password}`. An unknown email, a wrong password, an inactive account (`admins.active=false`) and a role other than `superadmin` all return the same generic 401. The password is checked first, so the account-status reason is only recorded for someone who knows the password. Each failure writes an `admin_login_failed` audit row. On success it sets the admin cookie and audits `admin_login`.
- Logout: clears the cookie and audits `admin_logout`.

Admins are disabled through the `active` flag rather than deleted, so their email in the audit trail keeps pointing to a real account.

---

## 12. Admin invites

**Endpoints:** `POST /api/admin/invites` (requires an admin session) and `POST /api/admin/invites/accept` (rate-limited)
**File:** `handlers/admin_invite.go`, `auth/invite.go`

### Create: `{email}`
- Generates a 32-character random token, bcrypt-hashes it and stores it with `invited_by` and `expires_at = now + 72h`.
- The plaintext token is returned **once**: `{email, token, expiresAt}`.
- Audit: `admin_invite_created` (principal = invitee, actor = inviter).

### Accept: `{email, token, password}`
1. Check the password with `auth.ValidateAdminPassword` (at least 12 characters, at most 72 bytes, bcrypt's limit). A bad password gets a 400 **before** the invite is looked up, so it can't consume the invite.
2. Load the **unused, unexpired** invites for that email (expiry checked in SQL).
3. bcrypt-compare the token against each. If none matches, return the generic 401.
4. Hash the password, then call `store.AcceptInviteAndCreateAdmin`, which **claims the invite and inserts the admin in one transaction**:
   - The claim only matches an invite that is still unused and unexpired. A concurrent accept of the same token loses and gets the generic 401.
   - If the email already belongs to an admin, the transaction rolls back, the invite stays unspent and the response is **409** `an admin account with this email already exists`. Only someone with a valid token for that email can reach this response.
5. Issue an admin session and audit `admin_invite_accepted`.

---

## 13. CSV ingestion of medical records

**Endpoint:** `POST /api/admin/ingest` (requires an admin session; `multipart/form-data` with fields `kitId` and `file`)
**Files:** `handlers/admin.go` `Ingest`, `internal/ingestion/ingestion.go`

1. The body is capped at **25 MB** (`MaxCSVUploadBytes`) with `MaxBytesReader`.
2. **Mis-link guard:** the uploaded filename must be exactly `<kitId>.csv` (extension case-insensitive) and match the `kitId` form field. Otherwise the request gets a 400.
3. The member must exist (otherwise 404).
4. `ProcessCSV`:
   - The column layout can be anything. The first row is treated as the header.
   - **Ragged rows are allowed** (`FieldsPerRecord = -1`). Extra values get the column names `col_N`.
   - Each row becomes an ordered `[]Field{Column, Value}`, so column order is preserved.
5. Each row is JSON-encoded (`EncodeRow`), **encrypted on its own** and inserted into `medical_records` with its `row_index` and a shared `source_batch` UUID.
6. An `ingestion_batches` row records who uploaded which file, how many rows it had and status `completed`.
7. Audit: `ingest` with `{rowCount, filename}`.
8. Response `201`: `{batchId, rowCount}`.

Partial failure is handled the same way as provisioning: there is no transaction. Rows that were already inserted stay, and the admin uploads the file again.

`medical_records.member_id` intentionally has **no foreign key** to `members`. This leaves room for a separate ingestion service that can't see KIT IDs (see the `app_ingest` role in section 18).

---

## 14. Viewing records

**Endpoints:** `GET /api/records` and `GET /api/records/{id}` (both require a member session)
**File:** `handlers/records.go`

- **List:** returns **metadata only** (`id`, `rowIndex`, `sourceBatch`, `createdAt`) for the session's KIT ID, ordered by `source_batch, row_index`. Nothing is decrypted.
- **Get one:**
  - `store.GetRecordForMember` filters by `id AND member_id` in **the same SQL query**, so another member's row is never loaded into memory.
  - "Doesn't exist" and "belongs to someone else" both return the same **404** (invariant #5).
  - The content is decrypted and decoded into `fields: [{column, value}]`.
  - Each successful view writes a row to `record_access_log` (member, record, IP, timestamp).

---

## 15. Audit logging

**Tables:** `audit_log` (general events) and `record_access_log` (record views).
**Writer:** `store.LogAudit(principal, eventType, ip, detail jsonb, actorAdminEmail *string)`

| Event | Principal | Actor admin | Detail |
|---|---|---|---|
| `member_provisioned` | KIT ID | ✓ | none |
| `recovery_keys_topped_up` | KIT ID | ✓ | `{count}` |
| `ingest` | KIT ID | ✓ | `{rowCount, filename}` |
| `onboard_begin` / `onboard_complete` | KIT ID | none | none |
| `login` / `recovery` | KIT ID | none | none |
| `admin_login` / `admin_logout` | admin email | none | none |
| `admin_invite_created` | invitee email | inviter | `{invitedBy}` |
| `admin_invite_accepted` | new admin email | none | none |

**Failed attempts** are audited as `<event>_failed` with an internal-only `{reason}`. The client still gets the generic 401 (invariant #6). The principal is whatever KIT ID or email was submitted, cut to 64 characters.

| Event | Reasons |
|---|---|
| `login_failed` | `unknown_kit_id`, `not_registered`, `bad_code` |
| `onboard_begin_failed` / `recovery_failed` | `no_matching_key`, `key_already_used` (lost a concurrent claim) |
| `onboard_complete_failed` | `unknown_kit_id`, `no_pending_secret`, `bad_code` |
| `admin_login_failed` | `unknown_email`, `bad_password`, `inactive`, `role_not_permitted` |
| `admin_invite_accept_failed` | `no_matching_invite`, `invite_already_used`, `admin_exists` |
| `admin_session_failed` | `unknown_admin`, `inactive`, `role_not_permitted` (a valid admin JWT that is no longer allowed) |

Not audited: requests rejected by the rate limiter (429), requests with a missing or invalid session cookie, and 400 input-validation errors.

- The IP comes from `clientIP`. It trusts the first value in `X-Forwarded-For`, which is set by nginx, and falls back to `RemoteAddr`.
- All audit writes go through `Server.audit`. They stay **best-effort**: a failed write never fails the request, because the action has already happened and failing the response could hide its result (such as a provision batch's one-time keys). A failed write is **logged** to the process log (journald) instead of being discarded. The same applies to `record_access_log` writes.
- Audit writes use a context that isn't canceled when the client disconnects, so dropping the connection can't drop the audit row.
- The `vaultapp` role has no `DELETE` privilege, so the app cannot delete audit rows.

---

## 16. Rate limiting

**File:** `internal/ratelimit/ratelimit.go`; it is set up in `handlers.NewServer`.

- A token bucket per IP: **10 requests/min steady, burst of 5**.
- **One limiter is shared** by every credential-checking endpoint: admin login, invite accept, onboard begin/complete, member login and recovery. Switching between those endpoints doesn't give an attacker a new budget.
- Requests over the limit get `429 {"error":"too many requests"}`.
- It is in-memory and per-process **by design** (one EC2 instance). The code comments say it must move to shared storage if the app is scaled horizontally. The per-IP map is never pruned.
- The IP comes from `X-Forwarded-For` (first value). That is safe only if nginx is the only way to reach the app.

---

## 17. Error handling and anti-enumeration

**File:** `handlers/handlers.go`

| Helper | Status | Body | Use |
|---|---|---|---|
| `badRequest` | 400 | a specific message | Input validation only. |
| `genericError` | 401 | `invalid credentials` | **Every** auth failure: unknown ID, unregistered member, wrong code, wrong or used key, inactive admin, missing or invalid session (invariant #6). |
| `notFound` | 404 | `not found` | A missing record, or another member's record (invariant #5). |
| `serverError` | 500 | `internal error` | Never echoes `err.Error()`. |

`decodeJSON` caps JSON bodies at 1 MB and turns on `DisallowUnknownFields`.

---

## 18. Database schema and least-privilege roles

**Migrations** are plain SQL files, applied in order by `cmd/migrate`:

| File | Contents |
|---|---|
| `0001_init.sql` | `members`, `recovery_keys` (CHECK purpose ∈ signup/recovery, partial index on unused keys), `medical_records`, `ingestion_batches`, `record_access_log`, `audit_log` |
| `0002_roles.sql` | Roles `vaultapp` and `app_ingest` (no passwords in the file; set them out-of-band) |
| `0003_admins.sql` | `admins` (unique email, bcrypt hash, `role` default `superadmin`, `active` flag) |
| `0004_admin_invites.sql` | `admin_invites` (token hash, `invited_by`, `used_at`, `expires_at`, partial index) |
| `0005_admin_role_check.sql` | CHECK constraint: `admins.role IN ('superadmin')` |

`0002_roles.sql` guards its `CREATE ROLE` statements with `IF NOT EXISTS`, because roles are cluster-wide and a second database on the same cluster would otherwise fail.

**Running migrations** (as the database owner, e.g. the RDS master user, not `vaultapp`):

```sh
DATABASE_URL=postgres://owner@host/db go run ./cmd/migrate status
DATABASE_URL=postgres://owner@host/db go run ./cmd/migrate up
```

- Each file runs in its own transaction together with its `schema_migrations` row, so a failing file leaves nothing behind and is retried next time.
- An advisory lock serializes concurrent runs.
- **Existing databases that were migrated by hand** must be baselined once before the first `up`: `migrate baseline 0004_admin_invites` records 0001–0004 as applied without running them. `up` then applies only `0005`. If you forget, `up` fails on 0001 (tables already exist), rolls back and tells you to baseline.

**Tests:** `go test ./...` runs the unit tests. The integration tests (store, handlers, migration runner) need a throwaway Postgres server where the role may create databases and roles. They are skipped unless `VAULT_TEST_DATABASE_URL` is set:

```sh
VAULT_TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres?sslmode=disable go test ./...
```

Each integration test creates its own uniquely named, fully migrated database and drops it afterwards.

**Roles:**
- `vaultapp` is the role the server connects as. It cannot run migrations. It has `SELECT, INSERT, UPDATE` on the app tables and **no DELETE and no DDL**.
- `app_ingest` has `INSERT` only on `medical_records` and `ingestion_batches`. It is **set up but unused**. It is meant for a future ingestion service that can't see KIT IDs.

**Data minimization:** the member's primary key *is* the KIT ID. No name, date of birth or other identifier is stored (invariant #1).

---

## 19. Deployment

**Target:** one EC2 instance (Amazon Linux 2023) running nginx with TLS in front of the app, plus RDS Postgres and AWS KMS.

| File | Role |
|---|---|
| `deploy/deploy.sh` | Cross-compiles a `linux/amd64` binary on your machine, copies it with `scp`, installs it to `/opt/vaultfinal/server` owned by `vaultapp` and restarts the systemd unit. Run it as `SSH_USER=ec2-user ./deploy/deploy.sh <host>`. |
| `deploy/medical-vault.service` | systemd unit that runs as `vaultapp`. `ExecStartPre=+fetch-secrets.sh` runs as root. It sets `EnvironmentFile`, `Restart=on-failure`, `NoNewPrivileges`, `PrivateTmp` and `ProtectSystem=strict`. |
| `deploy/fetch-secrets.sh` | Reads `/vaultfinal/DATABASE_URL` and `/vaultfinal/SESSION_KEY` (SecureString) from **SSM Parameter Store** and writes `/etc/vaultfinal/vaultfinal.env` with mode 600, owned by `vaultapp`. It also hard-codes `APP_ENV=production`, `USE_KMS=true`, `KMS_KEY_ID=alias/vault` and `PORT=8080`. It finds the region through IMDS. |
| `deploy/nginx-vaultfinal.conf` | Reverse proxy to `127.0.0.1:8080`. It sets `X-Forwarded-For $remote_addr` (overwriting any value the client sent) and `X-Forwarded-Proto`. certbot adds the 443/TLS block. |
| `deploy/iam-trust-policy.json` | Lets EC2 assume the instance role. |
| `deploy/iam-permissions-policy.json` | `kms:GenerateDataKey` and `kms:Decrypt` on one CMK, plus `ssm:GetParameter` on exactly the two parameters. |

Secrets are written to disk only in the env file. RDS and the app port are not reachable from the internet.

---

## 20. API reference

| Method | Path | Auth | Rate-limited | Handler |
|---|---|---|---|---|
| POST | `/api/admin/auth/login` | none | ✓ | `AdminLogin` |
| POST | `/api/admin/auth/logout` | admin | | `AdminLogout` |
| POST | `/api/admin/invites` | admin | | `CreateInvite` |
| POST | `/api/admin/invites/accept` | none | ✓ | `AcceptInvite` (400 bad password, 409 admin exists) |
| POST | `/api/admin/provision` | admin | | `Provision` |
| POST | `/api/admin/members/{kitId}/recovery-keys` | admin | | `TopUpRecoveryKeys` |
| POST | `/api/admin/ingest` | admin | | `Ingest` |
| POST | `/api/onboard/begin` | none | ✓ | `OnboardBegin` |
| POST | `/api/onboard/complete` | none | ✓ | `OnboardComplete` |
| POST | `/api/auth/login` | none | ✓ | `Login` |
| POST | `/api/auth/recovery` | none | ✓ | `Recovery` |
| POST | `/api/auth/logout` | none | | `Logout` |
| GET | `/api/session/me` | member | | `Me` |
| GET | `/api/records` | member | | `ListRecords` |
| GET | `/api/records/{id}` | member | | `GetRecord` |

---

## 21. Security invariants (as referenced in code)

The comments point to a `claude.md` spec that isn't in this folder. These are the invariants as the code describes them:

1. **Members are pseudonymous:** the KIT ID is the only identifier stored.
2. **Sensitive data is encrypted at rest:** TOTP secrets and record content.
3. **No plaintext credentials are stored:** recovery keys, invite tokens and admin passwords are bcrypt-hashed. Members have no password.
4. **Recovery keys are tied to a purpose:** a signup key works only for onboarding and a recovery key works only for recovery.
5. **Ownership is enforced in SQL:** another member's record returns 404, not 403.
6. **Auth errors are generic:** every credential failure gives the same 401.
7. **SQL lives only in `internal/store`.** Exceptions: schema-management SQL in `internal/migrate`, and SQL in tests.
8. **No static key in production:** `APP_ENV=production` requires `USE_KMS=true`.
9. **No HTTP endpoint creates an admin from a shared secret:** admins come only from the bootstrap CLI or an invite.

---

## 22. Observations and gaps

These are things I noticed while reading the code.

### Still open

- **The listen address is all interfaces.** `cmd/server` uses `Addr: ":" + port`, which binds to all interfaces. The systemd and nginx comments say the app "only ever binds 127.0.0.1:8080". Right now only the security group protects the port. If that port is ever exposed, a client could fake `X-Forwarded-For` and get around rate limiting and audit IPs.
- **AWS details are in a tracked file.** `deploy/iam-permissions-policy.json` contains a real AWS account ID and KMS key ARN.
- **Large provision batches can exceed the HTTP timeouts.** Since the limit went to 1000 members per request (modif #2), a full batch takes minutes of bcrypt work, far past the 30s `WriteTimeout`. The plaintext keys would then never reach the admin. Batches of about 200 or fewer are safe.
- **Member sessions can't be revoked.** Only admin sessions are re-checked per request.
- **The per-IP rate-limit map is never pruned.**

### Resolved (see `modif.md` #3)

- Single-use checks could race: recovery keys and invites are now claimed with a conditional UPDATE.
- A failed accept wasted the invite: the claim and admin insert now share one transaction.
- No password policy on invite accept: `auth.ValidateAdminPassword` is shared with the bootstrap CLI.
- No revocation for admin sessions: the admin row is re-checked on every request.
- Failed auth attempts weren't audited and audit write errors were ignored: failures are audited with reasons, and write errors are logged.
- `admins.role` was never read: only `superadmin` is allowed, enforced in code and by a CHECK constraint.
- No tests and no migration runner: there are now unit and integration tests, and `cmd/migrate`.
