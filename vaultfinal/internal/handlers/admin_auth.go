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
		s.auditFailure(r, req.Email, "admin_login", "unknown_email")
		genericError(w)
		return
	}
	if err != nil {
		serverError(w)
		return
	}
	// The password is checked before the account's status so the status
	// reason is only ever recorded for someone who knows the password.
	if !auth.ComparePassword(admin.PasswordHash, req.Password) {
		s.auditFailure(r, req.Email, "admin_login", "bad_password")
		genericError(w)
		return
	}
	if reason, ok := adminAllowed(admin); !ok {
		s.auditFailure(r, req.Email, "admin_login", reason)
		genericError(w)
		return
	}

	token, err := s.AdminSessions.IssueAdmin(admin.Email)
	if err != nil {
		serverError(w)
		return
	}
	s.AdminSessions.SetAdminCookie(w, token)

	s.audit(r, admin.Email, "admin_login", nil, nil)
	writeJSON(w, http.StatusOK, adminSessionResponse{Email: admin.Email})
}

// adminAllowed reports whether an admin account may hold a session right
// now. It's checked both at login and on every admin request (see
// RequireAdminSession), so disabling an admin or changing their role takes
// effect immediately rather than when their JWT expires. reason is
// internal-only, for the audit log.
func adminAllowed(admin *store.Admin) (reason string, ok bool) {
	if !admin.Active {
		return "inactive", false
	}
	if admin.Role != auth.AdminRoleSuperadmin {
		return "role_not_permitted", false
	}
	return "", true
}

// AdminLogout clears the admin session cookie.
func (s *Server) AdminLogout(w http.ResponseWriter, r *http.Request) {
	email := adminEmailFromContext(r.Context())
	s.AdminSessions.ClearAdminCookie(w)
	s.audit(r, email, "admin_logout", nil, nil)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
