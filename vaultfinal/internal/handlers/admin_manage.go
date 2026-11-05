package handlers

import (
	"errors"
	"net/http"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/store"
)

// DeleteAdmin permanently removes another admin account. Restricted to
// superadmins (requireSuperadmin), and refuses in two cases: the target
// has any audit_log/admin_invites history (disable instead -- hard
// deleting them would orphan that accountability trail), or the target is
// the last active superadmin (the system can never be left with zero).
func (s *Server) DeleteAdmin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, err := s.Store.GetAdminByEmail(ctx, adminEmailFromContext(ctx))
	if err != nil {
		serverError(w)
		return
	}
	if !requireSuperadmin(w, caller) {
		return
	}

	targetEmail := r.PathValue("email")
	target, err := s.Store.GetAdminByEmail(ctx, targetEmail)
	if errors.Is(err, store.ErrNotFound) {
		notFound(w)
		return
	}
	if err != nil {
		serverError(w)
		return
	}

	hasHistory, err := s.Store.AdminHasHistory(ctx, targetEmail)
	if err != nil {
		serverError(w)
		return
	}
	if hasHistory {
		writeJSON(w, http.StatusConflict, map[string]string{
			"error": "this admin has activity history and cannot be deleted; disable the account instead",
		})
		return
	}

	if target.Role == auth.AdminRoleSuperadmin && target.Active {
		count, err := s.Store.CountActiveSuperadmins(ctx)
		if err != nil {
			serverError(w)
			return
		}
		if count <= 1 {
			writeJSON(w, http.StatusConflict, map[string]string{
				"error": "cannot delete the last active superadmin",
			})
			return
		}
	}

	if err := s.Store.DeleteAdmin(ctx, targetEmail); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			notFound(w)
			return
		}
		serverError(w)
		return
	}

	callerEmail := adminEmailFromContext(ctx)
	s.audit(r, targetEmail, "admin_deleted", nil, &callerEmail)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ListAdmins returns admin accounts. Superadmins see everyone; a regular
// admin sees only their own entry — per the project's decision that only
// superadmins can see other admins, not just invite/delete them.
func (s *Server) ListAdmins(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, err := s.Store.GetAdminByEmail(ctx, adminEmailFromContext(ctx))
	if err != nil {
		serverError(w)
		return
	}

	if caller.Role != auth.AdminRoleSuperadmin {
		writeJSON(w, http.StatusOK, []store.AdminSummary{{
			Email:     caller.Email,
			Name:      caller.Name,
			Role:      caller.Role,
			Active:    caller.Active,
			CreatedAt: caller.CreatedAt,
		}})
		return
	}

	admins, err := s.Store.ListAdmins(ctx)
	if err != nil {
		serverError(w)
		return
	}
	writeJSON(w, http.StatusOK, admins)
}
