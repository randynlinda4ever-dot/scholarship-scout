-- Owner-authorized remediation for the live supabase_admin ACLs.
-- This is intentionally outside supabase/migrations: the connected project SQL role
-- cannot assume supabase_admin, so ordinary migration execution cannot apply it.
-- Execute only through an approved Supabase platform-owner path after reviewing
-- the statements and their effect on future public objects.

DO $$
BEGIN
  IF current_user <> 'supabase_admin'
     AND NOT pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
    RAISE EXCEPTION
      'Run this script as supabase_admin or a role authorized to assume supabase_admin.';
  END IF;
END
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default unless revoked
-- globally for this object-creating role.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- These tables are unused by the browser app: profiles and student-specific
-- eligibility assessments remain in the encrypted local vault.
REVOKE ALL PRIVILEGES ON TABLE public.student_profiles FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.eligibility_checks FROM anon, authenticated;

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eligibility_checks ENABLE ROW LEVEL SECURITY;
