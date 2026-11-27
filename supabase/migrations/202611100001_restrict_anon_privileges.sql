-- Scholarship Scout is sign-in-only. RLS already scopes each row to auth.uid().
-- Remove unused anonymous access and non-row-scoped permissions that bypass row policies.
-- The Supabase SQL execution role cannot change project-wide default privileges here;
-- existing tables are hardened below, and this limitation is documented in docs/security-review.md.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
