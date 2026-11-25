# CORS 2.0: implement now, add the domain later

**Status: plan for implementation.** This supersedes `CORS.md` for *when* things happen, not *what* they are — the technical content (headers, cookie rules, CSRF reasoning) is the same. This file splits that work into two phases so the frontend (Next.js, `kp` branch, `localhost:9002`) can be built and tested today, with no domain and no HTTPS yet, and the production cutover (Option A: nginx + Let's Encrypt on the existing EC2 instance) is a short, well-defined second step whenever the client's domain is ready.

---

## Why this split works

Section 4 of `CORS.md` lays out three scenarios. The one that applies **today** is the simplest one:

> **Development:** frontend on `localhost:<port>`, API through the tunnel at `localhost:18080` → **no cookie change needed.** Same site, so today's `SameSite=Lax` cookies are sent; `localhost` counts as secure. HTTPS not needed.

That means the full CORS middleware (section 3) and the CSRF-hardening (section 5) can be built, deployed, and tested **right now**, against the real backend, through the existing SSH tunnel — without waiting on a domain. Only two things are genuinely blocked until the domain exists:

- **HTTPS on the API** (needed once the frontend is cross-site, e.g. on Vercel)
- **`SameSite=None`** on the session cookies (only safe once HTTPS exists)

Those two are Phase 2, below.

---

## Phase 1 — implement now (no domain required)

### 1. What to find out (answered already)

| Question | Answer |
|---|---|
| Frontend dev address | `http://localhost:9002` (Next.js, `next dev --turbopack -p 9002`) |
| Frontend framework | Next.js 15.5.9 |
| Production frontend host | **Undecided between two options:** Firebase Hosting (the frontend dev's current setup) or Vercel (originally discussed). See Phase 2, step 0 for both. |
| Production API host | Same EC2 instance (`34.236.186.107`), Option A (nginx + Let's Encrypt), domain TBD |
| Proxy option considered? | Yes (Next.js `rewrites`) — not used; going with real CORS since this is headed to production with a real client |

### 2. Backend change: CORS middleware

Same as `CORS.md` section 3, implemented in full now.

**New environment variable:**

```
CORS_ALLOWED_ORIGINS=http://localhost:9002
```

(Comma-separated if more origins are ever needed in dev, e.g. a second port.)

**Files touched:**

| File | Change |
|---|---|
| `internal/config/config.go` | Read + validate `CORS_ALLOWED_ORIGINS`: comma-separated, each entry a full origin (`scheme://host[:port]`), no paths, no `*`. Empty = CORS off (today's behavior, unchanged for the smoke test / curl / deploy scripts). |
| `internal/handlers/cors.go` *(new)* | The middleware (below). |
| `internal/handlers/handlers.go` | `Routes()` returns `s.cors(mux)` instead of `mux`, wrapping the whole router so preflights are answered before Go's router can 405 them. |
| `deploy/fetch-secrets.sh` | Add the `CORS_ALLOWED_ORIGINS=...` line to the env file it writes on the server. |
| `.env.example` | Document the variable. |

**Middleware** (combines `CORS.md` section 3's sketch with section 5's Origin-check-on-POST, built in from the start so Phase 2 doesn't require touching this function again):

```go
// internal/handlers/cors.go
func (s *Server) cors(next http.Handler) http.Handler {
        allowed := make(map[string]bool, len(s.Config.CORSAllowedOrigins))
        for _, o := range s.Config.CORSAllowedOrigins {
                allowed[o] = true
        }
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                origin := r.Header.Get("Origin")
                if origin == "" {
                        // not a cross-origin browser request (curl, Postman, the deploy scripts)
                        next.ServeHTTP(w, r)
                        return
                }
                w.Header().Add("Vary", "Origin")

                if !allowed[origin] {
                        if r.Method == http.MethodOptions {
                                w.WriteHeader(http.StatusForbidden)
                                return
                        }
                        if r.Method == http.MethodPost {
                                // CORS.md section 5, point 1: reject a POST from a foreign origin
                                // even though CORS headers alone wouldn't block the *send*.
                                w.WriteHeader(http.StatusForbidden)
                                return
                        }
                        next.ServeHTTP(w, r) // no CORS headers: the browser blocks the response
                        return
                }

                h := w.Header()
                h.Set("Access-Control-Allow-Origin", origin)
                h.Set("Access-Control-Allow-Credentials", "true")

                if r.Method == http.MethodOptions {
                        h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                        h.Set("Access-Control-Allow-Headers", "Content-Type")
                        h.Set("Access-Control-Max-Age", "600")
                        w.WriteHeader(http.StatusNoContent)
                        return
                }
                next.ServeHTTP(w, r)
        })
}
```

### 3. Backend change: enforce JSON `Content-Type`

`CORS.md` section 5, point 2. In `decodeJSON` (wherever it currently lives in `internal/handlers`), reject anything that isn't `Content-Type: application/json` with `415`. This forces a preflight on every real JSON call, closing the "plain HTML form posts JSON-looking text" gap described in the guide.

### 4. Cookies: no change yet

Leave `internal/auth/session.go` and `internal/auth/admin_session.go` exactly as they are (`HttpOnly; Secure; SameSite=Lax`). `localhost` satisfies `Secure`, and same-site `Lax` cookies are sent normally between `localhost:9002` and `localhost:18080`. Nothing here needs to change until Phase 2.

### 5. Frontend change (Next.js, `kp` branch)

Per `CORS.md` section 6:

```ts
// every fetch call
fetch(`${API_URL}/api/...`, {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  ...
});
```

```
// .env.local (frontend)
NEXT_PUBLIC_API_URL=http://localhost:18080
```

Run `tunnel.sh` from `vaultfinal` before starting the frontend dev server, so `localhost:18080` is live.

### 6. Verify (same as `CORS.md` section 8)

With `tunnel.sh` running:

```bash
curl -i -X OPTIONS http://localhost:18080/api/auth/login \
  -H 'Origin: http://localhost:9002' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
# expect: 204, Access-Control-Allow-Origin: http://localhost:9002,
#         Access-Control-Allow-Credentials: true
```

```bash
curl -i -X OPTIONS http://localhost:18080/api/auth/login \
  -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'
# expect: 403, no Access-Control-Allow-Origin header
```

Then: run the Next.js dev server (`npm run dev`, port 9002), log in from the real UI, reload the page, confirm `/api/session/me` still returns the session. That confirms cookies are flowing correctly same-site.

**Tests to add** to `internal/handlers/handlers_test.go` (unchanged from `CORS.md` section 8):
- preflight allowed / denied
- no CORS headers for a disallowed origin
- a `POST` with a foreign `Origin` rejected (403)
- a non-JSON `Content-Type` rejected (415)
- requests without an `Origin` header unchanged (curl, scripts keep working)

### Phase 1 checklist

- [ ] `CORS_ALLOWED_ORIGINS=http://localhost:9002` added to config, `fetch-secrets.sh`, `.env.example`
- [ ] CORS middleware wraps the whole router; preflights answered before routing
- [ ] Origin check on `POST`, JSON `Content-Type` enforced (415 otherwise)
- [ ] Cookies left as `SameSite=Lax` (no change)
- [ ] Deployed via the normal `deploy.md` flow (this is a real code change — goes through `00-check.sh` → `05-smoke-test.sh` like anything else)
- [ ] Frontend sends `credentials: 'include'`, points at `http://localhost:18080` via `tunnel.sh`
- [ ] Preflight curl tests pass (above)
- [ ] Real login from the Next.js UI works, session persists across reload
- [ ] Go tests from section 8 added and passing

---

## Phase 2 — when the client's domain is ready

This is **Option A**: reverse proxy + Let's Encrypt on the existing EC2 instance, no load balancer.

### 0. Decide the frontend host, then confirm its details

Two options are on the table. The CORS mechanism is identical either way — section 1 and the middleware in Phase 1 don't change — only the exact origin string(s) that go into `CORS_ALLOWED_ORIGINS` differ, and the preview-deploy conventions differ. Pick one (or confirm which one is actually already live) before filling in `CORS_ALLOWED_ORIGINS` for production.

**Option 1: Firebase Hosting** (the frontend dev's current setup)

Get these from the Firebase console (console.firebase.google.com → the project → **Hosting** or **App Hosting** in the sidebar) or from whoever manages it:

- **The live URL** — typically `<project-id>.web.app` or `<project-id>.firebaseapp.com`, or a custom domain if one's attached to the Firebase project.
- **Classic Firebase Hosting vs. Firebase App Hosting.** This matters: App Hosting is Google's newer, Next.js-native hosting (it runs the app as a real Next.js server, similar in spirit to Vercel) and is the more likely fit given this is an SSR-capable Next.js 15 app — classic Firebase Hosting is built for static sites or needs a separate Cloud Function to serve SSR routes. Either way the *CORS origin* is the same (the live URL), but it affects whether preview/staging channels exist and how they're named.
- **Does the project use Firebase Hosting preview channels** (`firebase hosting:channel:deploy <name>`, giving URLs like `<project-id>--<channel>-<hash>.web.app`)? These are Firebase's equivalent of Vercel preview deployments — decide whether they need API access.

**Option 2: Vercel**

- **The live URL** — typically `<project>.vercel.app`, or a custom domain if attached.
- **Vercel preview deployments** give every branch/PR its own URL (`*-git-branch.vercel.app`). Decide whether previews need to hit the real API or only production.
- Vercel needs effectively zero config for a plain Next.js app (auto-detected), so switching to it later is low-effort if Firebase Hosting turns out not to fit.

**Either way:** never put `*` in `CORS_ALLOWED_ORIGINS` for a preview-deploy pattern — the guide's section 3 explains why browsers refuse `*` once credentials/cookies are involved. If previews need API access, the exact preview-URL pattern needs a small, deliberate match in the config, not a wildcard.

### 1. Infrastructure

1. Client (or you) registers/points a domain — e.g. `api.clientdomain.com` — at the Elastic IP `34.236.186.107` (A record). The Elastic IP means this step doesn't need to be redone if the instance restarts.
2. Install nginx on the EC2 instance.
3. Configure nginx to reverse-proxy `https://api.clientdomain.com` → `http://localhost:8080`.
4. Get a cert with `certbot --nginx`, confirm auto-renewal is set up (`certbot renew --dry-run`).
5. Security group: open **443** to the internet, keep **8080 closed to the internet** (nginx talks to it over `localhost`, same pattern as the existing "closed 8080" rule verified in deploy Step 4). Keep **22 open to your IP only**, as today.

### 2. Backend changes (small, additive — nothing from Phase 1 is undone)

| Change | File |
|---|---|
| Add the chosen host's production URL (and any preview pattern you decide to support) to `CORS_ALLOWED_ORIGINS` | `deploy/deploy.env`-fed config, same variable as Phase 1 |
| Cookies: `SameSite=Lax` → `SameSite=None` (keep `Secure`) | `internal/auth/session.go`, `internal/auth/admin_session.go` |
| Config validation: reject `http://` origins other than `localhost` once in production (per `CORS.md` section 3's table) | `internal/config/config.go` |

The middleware itself (`cors.go`) doesn't change — it already does everything needed; only the allowlist and the cookie flag change.

### 3. Preview deploys — already decided in step 0

Covered above per host. Whichever one is chosen, the decision (previews allowed or not) and the resulting `CORS_ALLOWED_ORIGINS` entries should be the same regardless of host — this step is just a reminder to actually apply that decision to the config once the host is picked.

### 4. Safari note (carried over from `CORS.md` section 4)

Safari blocks third-party cookies even with `SameSite=None`. If Safari users matter for this client, the more robust fix is making frontend and API **same-site** (e.g. `app.clientdomain.com` + `api.clientdomain.com` under the same registrable domain, with the frontend's custom domain attached to whichever host is chosen) rather than relying on Firebase's `*.web.app` or Vercel's `*.vercel.app` default domain + a bare AWS address for the API. Worth deciding before Phase 2, since it affects whether a custom domain is attached to the frontend host or its default one is kept — and this consideration is identical for either host.

### Phase 2 checklist

- [ ] Frontend host decided: **Firebase Hosting** or **Vercel** (not both — pick one as the real production target)
- [ ] If Firebase: live URL confirmed (classic Hosting vs. App Hosting, custom domain or not)
- [ ] If Vercel: live URL confirmed (`*.vercel.app` or custom domain)
- [ ] Preview-deploy access decided (Firebase channels or Vercel previews, whichever applies) and reflected in `CORS_ALLOWED_ORIGINS`
- [ ] Domain decided for the **API**, DNS A record → `34.236.186.107`
- [ ] nginx installed, reverse-proxying to `localhost:8080`
- [ ] Let's Encrypt cert via certbot, auto-renewal confirmed
- [ ] Security group: 443 open, 8080 still closed to the internet, 22 unchanged
- [ ] Production (and decided preview) origins added to `CORS_ALLOWED_ORIGINS`
- [ ] Cookies flipped to `SameSite=None; Secure`
- [ ] Config rejects non-localhost `http://` origins in production
- [ ] Safari/same-site decision made and reflected in the chosen host's custom-domain setup
- [ ] Full redeploy through `deploy.md`, re-run smoke test
- [ ] Real end-to-end login tested from the live frontend URL against the live HTTPS API
