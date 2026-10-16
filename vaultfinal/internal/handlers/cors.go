package handlers

import (
	"net/http"
	"slices"
)

func (s *Server) CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin") //1

		preflight := r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" //2

		if !slices.Contains(s.Config.AllowedOrigins, origin) {
			if preflight {
				w.WriteHeader(http.StatusForbidden) //3
				return
			}
			next.ServeHTTP(w, r) //4
			return
		}

		w.Header().Set("Access-Control-Allow-Origin", origin) //5
		w.Header().Set("Access-Control-Allow-Credentials", "true") //6

		if preflight {
			w.Header().Add("Vary", "Access-Control-Request-Method")
			w.Header().Add("Vary", "Access-Control-Request-Headers")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type") //7
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}