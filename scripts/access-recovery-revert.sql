-- Reverts 0006_access_recovery (D-32, slice 1). Run by hand, NEVER automatic, only after the code that uses these
-- columns is no longer deployed. Destructive: it drops the columns and the table, and the data in them is lost
-- (e-mail verification marks, password-change marks, recovery links, request counters).
-- Safe before anyone uses them: right after the migration these columns are all null and the table is empty.
-- Then remove its record: DELETE FROM drizzle.__drizzle_migrations WHERE created_at = <"when" of 0006 in meta/_journal.json>;
-- For production prefer restoring the Neon backup branch taken before the migration (PROJECT_WORKFLOW.md, runbook).
BEGIN;
DROP INDEX IF EXISTS uq_app_users_verified_email;
ALTER TABLE app_users DROP COLUMN IF EXISTS email_verified_at;
ALTER TABLE app_users DROP COLUMN IF EXISTS credentials_changed_at;
ALTER TABLE owner_recovery_tokens DROP COLUMN IF EXISTS purpose;
ALTER TABLE owner_recovery_tokens DROP COLUMN IF EXISTS email;
DROP TABLE IF EXISTS access_recovery_requests;
COMMIT;
