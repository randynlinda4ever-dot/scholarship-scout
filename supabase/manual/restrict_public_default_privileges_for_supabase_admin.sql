-- Run only from a database-owner session permitted to alter defaults owned by supabase_admin.
-- The current connected postgres session cannot SET ROLE supabase_admin and cannot execute these statements.
-- This is intentionally outside supabase/migrations/ so a normal deploy does not fail on missing role membership.

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- Verify after applying.
SELECT
  pg_get_userbyid(d.defaclrole) AS owner_role,
  d.defaclobjtype AS object_type,
  COALESCE(r.rolname, 'PUBLIC') AS grantee,
  a.privilege_type
FROM pg_default_acl AS d
CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
LEFT JOIN pg_roles AS r ON r.oid = a.grantee
LEFT JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
WHERE pg_get_userbyid(d.defaclrole) = 'supabase_admin'
  AND n.nspname = 'public'
  AND COALESCE(r.rolname, 'PUBLIC') IN ('anon', 'authenticated')
ORDER BY d.defaclobjtype, grantee, a.privilege_type;
