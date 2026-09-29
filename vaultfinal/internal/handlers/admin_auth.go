package handlers

import (
	"errors"
	"net/http"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/store"
)

type adminLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type adminSessionResponse struct {
	Email string `json:"email"`
}

// AdminLogin authenticates an admin by email + bcrypt password. As with
// member Login, every failure — unknown email, disabled account, wrong
// password — returns the same genericError (invariant #6).
func (s *Server) AdminLogin(w http.ResponseWriter, r *http.Request) {
	var req adminLoginRequest
	if err := decodeJSON(w, r, &req); err != nil || req.Email == "" || req.Password == "" {
		badRequest(w, "email and password are required")
		return
	}

	ctx := r.Context()
	admin, err := s.Store.GetAdminByEmail(ctx, req.Email)
	if errors.Is(err, store.ErrNotFound) {
		genericError(w)
		return
	}
	if err != nil {
		serverError(w)
		return
	}
	if !admin.Active || !auth.ComparePassword(admin.PasswordHash, req.Password) {
		genericError(w)
		return
	}

	token, err := s.AdminSessions.IssueAdmin(admin.Email)
	if err != nil {
		serverError(w)
		return
	}
	s.AdminSessions.SetAdminCookie(w, token)

	_ = s.Store.LogAudit(ctx, admin.Email, "admin_login", clientIP(r), nil, nil)
	writeJSON(w, http.StatusOK, adminSessionResponse{Email: admin.Email})
}

// AdminLogout clears the admin session cookie.
func (s *Server) AdminLogout(w http.ResponseWriter, r *http.Request) {
	email := adminEmailFromContext(r.Context())
	s.AdminSessions.ClearAdminCookie(w)
	_ = s.Store.LogAudit(r.Context(), email, "admin_logout", clientIP(r), nil, nil)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
