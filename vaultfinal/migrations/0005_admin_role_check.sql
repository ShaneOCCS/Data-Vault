-- 0005_admin_role_check.sql — restrict admins.role to known values.
--
-- The application now reads admins.role on every admin request and only
-- lets 'superadmin' through (see handlers.adminAllowed). This constraint is
-- the schema-side half of that: a typo'd or invented role can't be written
-- at all, so "unknown role" only ever means a role added on purpose by a
-- later migration that extends this list together with the code that
-- enforces it.

ALTER TABLE admins
    ADD CONSTRAINT admins_role_check CHECK (role IN ('superadmin'));
