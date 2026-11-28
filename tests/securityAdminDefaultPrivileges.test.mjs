import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/admin/restrict-supabase-admin-public-default-privileges.sql", import.meta.url),
  "utf8",
);

test("owner-only SQL refuses execution when the caller cannot assume supabase_admin", () => {
  assert.match(migration, /current_user\s*<>\s*["']supabase_admin["']/i);
  assert.match(migration, /pg_has_role\(current_user,\s*["']supabase_admin["'],\s*["']MEMBER["']\)/i);
  assert.match(migration, /RAISE EXCEPTION/i);
});

test("future supabase_admin public tables and sequences are not granted to public client roles", () => {
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public[\s\S]*?REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated/i);
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public[\s\S]*?REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated/i);
});

test("future supabase_admin public functions cannot be executed by public client roles", () => {
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public[\s\S]*?REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated/i);
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin[\s\S]*?REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/i);
});

test("student profile and eligibility tables stay private to privileged server operations", () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.student_profiles FROM anon, authenticated/i);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.eligibility_checks FROM anon, authenticated/i);
  assert.match(migration, /ALTER TABLE public\.student_profiles ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /ALTER TABLE public\.eligibility_checks ENABLE ROW LEVEL SECURITY/i);
});
