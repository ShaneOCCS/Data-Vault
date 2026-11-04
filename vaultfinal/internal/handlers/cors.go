// Package handlers: CORS middleware. Wraps the entire router (see Routes())
// so preflight OPTIONS requests are answered before they ever reach
// ServeMux's routing, which would otherwise answer them with 405 (routes
// are registered as "POST /api/..." etc., not "OPTIONS /api/...").
package handlers

import (
	"net/http"
	"slices"
)

// CORS enforces the CORS_ALLOWED_ORIGINS allowlist (internal/config) on
// every request. An empty allowlist (the zero-config default) makes this a
// no-op: no Origin header means no browser is involved (curl, Postman, the
// deploy scripts), and any Origin header just falls through unchanged since
// nothing will ever be in an empty allowlist.
func (s *Server) CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin")

		// A real CORS preflight is OPTIONS *and* carries
		// Access-Control-Request-Method — a bare OPTIONS probe without it
		// isn't one, and shouldn't be short-circuited here.
		preflight := r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != ""

		if origin == "" || !slices.Contains(s.Config.AllowedOrigins, origin) {
			if preflight {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			// A POST carrying a foreign Origin is rejected outright, even
			// though CORS headers alone wouldn't stop the browser from
			// sending it (CORS blocks reading the response, not the send).
			// This matters once cookies move to SameSite=None (CORS.md
			// section 5) — built in now so that switch needs no further
			// change here.
			if origin != "" && r.Method == http.MethodPost {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if preflight {
			w.Header().Add("Vary", "Access-Control-Request-Method")
			w.Header().Add("Vary", "Access-Control-Request-Headers")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
