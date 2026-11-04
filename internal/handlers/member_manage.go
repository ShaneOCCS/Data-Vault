package handlers

import "net/http"

// ListMembers returns every provisioned member (KIT ID). Read-only — any
// active admin role can call it (not superadmin-gated).
func (s *Server) ListMembers(w http.ResponseWriter, r *http.Request) {
	members, err := s.Store.ListMembers(r.Context())
	if err != nil {
		serverError(w)
		return
	}
	writeJSON(w, http.StatusOK, members)
}
