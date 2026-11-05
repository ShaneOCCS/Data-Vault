-- Adds a display name to admins, separate from their email (the unique
-- login identifier). NOT NULL DEFAULT '' so existing admin rows (created
-- before this column existed) don't need a backfilled guess at their name.
ALTER TABLE admins ADD COLUMN name text NOT NULL DEFAULT '';
