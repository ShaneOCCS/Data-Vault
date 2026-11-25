-- Allows the lesser 'admin' role alongside 'superadmin'. Invited admins
-- always get 'admin' (see store.AcceptInviteAndCreateAdmin) -- 'superadmin'
-- is only ever set by cmd/bootstrap-admin or a manual DB promotion, never
-- through the invite API, so a superadmin can never accidentally create a
-- peer superadmin through an ordinary invite.
ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check CHECK (role IN ('superadmin', 'admin'));
