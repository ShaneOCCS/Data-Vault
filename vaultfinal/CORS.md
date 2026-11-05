# Connecting a frontend: CORS guide

**Status: not implemented yet.** This guide describes what has to be added to the backend, and what has to be decided first, when it's time to connect the frontend. Nothing in it has been applied to the code.

---

## 1. Why the frontend can't call the API today

When a web page calls an API on a **different origin**, the browser asks the API for permission first. An origin is the scheme, host and port together, so `http://localhost:3000` and `http://localhost:18080` are different origins. This permission system is **CORS** (Cross-Origin Resource Sharing).

The backend currently sends **no CORS headers**, so the browser blocks every cross-origin call. The request may reach the server, but the page never gets to read the response.

Tools like curl, Postman and the deploy scripts aren't browsers, so they're not affected. That's why the smoke test passes without CORS.

The backend also uses **cookie-based sessions**: `vault_session` for members and `vault_admin_session` for admins. Cross-origin cookies need extra settings on both sides, covered in section 4.

---

## 2. What to find out first (before writing any code)

| Question | Why it matters | Example answer |
|---|---|---|
| **What address does the frontend run on in development?** | It goes on the allowed-origins list | `http://localhost:3000` (Next.js / CRA), `http://localhost:5173` (Vite) |
| **What address will it run on when deployed?** | Same list, production entry | `https://vault-frontend.vercel.app` |
| **Is that the same *site* as the API?** | Decides the cookie settings (section 4) | Same site: `app.example.com` + `api.example.com`. Different site: `*.vercel.app` + an AWS IP |
| **Will the API have HTTPS by then?** | Cross-site cookies only work over HTTPS | See section 4 |
| **Can the frontend use a proxy instead?** | It might avoid CORS completely (section 7) | Next.js rewrites, Vite dev proxy |

**Same site vs. same origin:**
- **Same origin** means the scheme, host and port all match. Anything else needs CORS.
- **Same site** is looser: the same registrable domain, e.g. `example.com`. All `localhost` ports count as the same site.

The site question only decides which cookie settings are needed.

---

## 3. Backend change 1: a CORS middleware

### What it must do

For each request, check the `Origin` header against an **allowlist** read from a new environment variable:

```
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://vault-frontend.example.com
```

If the origin is on the list, add these headers:

| Header | Value | Why |
|---|---|---|
| `Access-Control-Allow-Origin` | the request's exact `Origin` | **Never `*`.** Browsers refuse `*` when cookies are involved, and it would allow every website. |
| `Access-Control-Allow-Credentials` | `true` | Lets the browser send and receive the session cookies |
| `Vary` | `Origin` | Stops caches from mixing up responses meant for different origins |

For **preflight** requests (method `OPTIONS`, sent by the browser before the real request), also add the headers below and answer **`204`** straight away. The request must not reach the router, the rate limiter or the auth check.

| Header | Value |
|---|---|
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` (the only methods the API uses) |
| `Access-Control-Allow-Headers` | `Content-Type` |
| `Access-Control-Max-Age` | `600` (the browser caches the permission for 10 minutes) |

If the origin **isn't** on the list, add no CORS headers and let the browser block it. Return `403` for preflights.

### Where it goes

| File | Change |
|---|---|
| `internal/config/config.go` | Read and validate `CORS_ALLOWED_ORIGINS`: comma-separated, each entry a full origin (`scheme://host[:port]`), no paths, no `*`. Empty means CORS is off (today's behavior). In production, reject `http://` entries other than localhost. |
| `internal/handlers/cors.go` *(new)* | The middleware below. |
| `internal/handlers/handlers.go` | `Routes()` returns `s.cors(mux)` instead of `mux`, so it wraps **everything**. |
| `deploy/fetch-secrets.sh` | Add the `CORS_ALLOWED_ORIGINS=...` line to the env file it writes. |
| `.env.example` | Document the variable. |

**Why it must wrap the whole router:** routes are registered as `"POST /api/..."`. Go's router answers an `OPTIONS` request to them with **405 Method Not Allowed**, so preflights would always fail unless the middleware intercepts them first.

### Sketch

This is for when it's time. It isn't in the code.

```go
// internal/handlers/cors.go
func (s *Server) cors(next http.Handler) http.Handler {
	allowed := make(map[string]bool, len(s.Config.CORSAllowedOrigins))
	for _, o := range s.Config.CORSAllowedOrigins {
		allowed[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" { // not a cross-origin browser request
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Add("Vary", "Origin")
		if !allowed[origin] {
			if r.Method == http.MethodOptions {
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

---

## 4. Backend change 2: cookie settings (depends on section 2)

Today both session cookies are `HttpOnly; Secure; SameSite=Lax` (`internal/auth/session.go`, `internal/auth/admin_session.go`).

| Situation | Cookie change needed | HTTPS on the API? |
|---|---|---|
| **Development:** frontend on `localhost:<port>`, API through the tunnel at `localhost:18080` | **None.** Same site, so `Lax` cookies are sent; `localhost` counts as secure. | Not needed |
| **Frontend and API on the same site**, e.g. `app.example.com` + `api.example.com` | **None** (`Lax` works) | **Required:** `Secure` cookies are only stored over HTTPS |
| **Frontend and API on different sites**, e.g. `*.vercel.app` + an AWS address | Change to **`SameSite=None`**, keep `Secure` | **Required** |

**What this means:**
- **Development works with CORS alone:** add the middleware, add `http://localhost:3000` (or whatever the frontend uses) to the list, and use `tunnel.sh`.
- **A deployed frontend needs HTTPS on the API.** Without it, browsers won't keep the login cookie, whatever the CORS settings. That's the moment to add HTTPS back (a domain or similar, nginx, a certificate).
- **Safari** blocks third-party cookies by default, even with `SameSite=None`. If Safari users matter, prefer the **same-site** setup, e.g. `app.yourdomain.com` + `api.yourdomain.com`.

---

## 5. Backend change 3: CSRF protection (required with `SameSite=None`)

With `SameSite=None`, the browser attaches the session cookie to requests from **any** website. CORS only stops other sites from **reading** responses; it doesn't stop them **sending** requests.

Two weaknesses in the current code matter here:
- **Admin uploads look like form posts.** The CSV upload (`/api/admin/ingest`) is `multipart/form-data`, which any web page can send without a preflight.
- **The `Content-Type` isn't checked.** `decodeJSON` reads the body without checking its type, so a plain HTML form posting JSON-looking text would be accepted.

**Required, whenever cookies may be cross-site:**
1. **Check `Origin` on every `POST`.** If the header is present and not on the allowlist, reject with `403`. Put this in the same middleware.
2. **Require `Content-Type: application/json`** in `decodeJSON`, and reject anything else with `415`. That forces a preflight for every JSON call.

The middleware sketch in section 3 doesn't include point 1 yet. Add it when implementing.

---

## 6. What the frontend must do

Whatever framework is used, every API call must **include credentials**, or the session cookie isn't sent:

```js
// fetch
fetch(`${API_URL}/api/records`, { credentials: 'include' });

fetch(`${API_URL}/api/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ kitId, code }),
});

// axios
axios.create({ baseURL: API_URL, withCredentials: true });
```

- Put the API address in the frontend's environment config:
  - development: `http://localhost:18080`, with `tunnel.sh` running;
  - later: the deployed API address.
- **Don't read the session cookie in JavaScript.** It's `HttpOnly`, by design. Use `GET /api/session/me` to find out who's logged in.

**Responses to handle:**

| Status | Meaning |
|---|---|
| `401` | Wrong credentials, or the session expired or was revoked. Go back to login. |
| `400` | Bad input. The `error` text is safe to show. |
| `409` | Invite accept: an admin with that email already exists. |
| `429` | Too many login attempts. Wait a minute. |
| *(network error, no status)* | Usually CORS: the origin isn't on the allowlist. Check the browser console. |

---

## 7. Alternative: a proxy instead of CORS

If the frontend framework can forward requests itself, the browser only ever talks to the frontend's own origin, and **no CORS, cookie or CSRF changes are needed**. Examples: Next.js `rewrites`, the Vite dev server `proxy`, or nginx serving the frontend and the API under one domain.

The catch: every user then reaches the API **from the proxy's address**. The backend rate-limits logins **per address**, so all users would share one limit. That's fine for development, but needs a backend change (trusting the forwarded user address) before real users.

---

## 8. How to check it works (once implemented)

With `tunnel.sh` running, a correct preflight from an allowed origin returns `204` with the CORS headers:

```bash
curl -i -X OPTIONS http://localhost:18080/api/auth/login \
  -H 'Origin: http://localhost:3000' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
# expect: 204, Access-Control-Allow-Origin: http://localhost:3000,
#         Access-Control-Allow-Credentials: true
```

A disallowed origin gets `403` and no `Access-Control-Allow-Origin` header:
```bash
curl -i -X OPTIONS http://localhost:18080/api/auth/login \
  -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'
```

Then in the browser: log in from the frontend, reload, and call `/api/session/me`. If it returns the KIT ID, cookies are working.

**Tests to add** to `internal/handlers/handlers_test.go`:
- preflight allowed / denied;
- no CORS headers for a disallowed origin;
- a `POST` with a foreign `Origin` rejected (403);
- a non-JSON `Content-Type` rejected (415);
- requests without an `Origin` header unchanged, so curl and the scripts keep working.

---

## Checklist for when it's time

- [ ] Frontend dev and production addresses known (section 2)
- [ ] Decided: CORS (sections 3–5) or a proxy (section 7)
- [ ] `CORS_ALLOWED_ORIGINS` added to config, `fetch-secrets.sh` and `.env.example`
- [ ] CORS middleware wraps the whole router; preflights answered before routing
- [ ] Origin check on `POST` and JSON `Content-Type` enforced
- [ ] Cookie `SameSite` set according to section 4
- [ ] HTTPS on the API, if the frontend is deployed anywhere other than localhost
- [ ] Frontend sends `credentials: 'include'` / `withCredentials: true`
- [ ] Tests from section 8 added and passing; `modif.md` entry written
