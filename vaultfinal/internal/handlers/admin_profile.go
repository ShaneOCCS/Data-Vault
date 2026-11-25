package handlers

import "net/http"

type updateProfileRequest struct {
	Name string `json:"name"`
}

// UpdateProfile lets the logged-in admin set their own display name. Any
// admin role may call this -- it only ever touches the caller's own row,
// scoped by their session's email (never a request parameter), so no
// authorization check beyond RequireAdminSession is needed.
func (s *Server) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req updateProfileRequest
	if err := decodeJSON(w, r, &req); err != nil || req.Name == "" {
		badRequest(w, "name is required")
		return
	}

	email := adminEmailFromContext(r.Context())
	if err := s.Store.UpdateAdminName(r.Context(), email, req.Name); err != nil {
		serverError(w)
		return
	}

	s.audit(r, email, "admin_profile_updated", map[string]any{"name": req.Name}, &email)
	writeJSON(w, http.StatusOK, map[string]string{"email": email, "name": req.Name})
}
