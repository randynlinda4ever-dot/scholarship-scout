# Live Supabase schema and access audit

## Project and audit scope

Project: scholarship-scout (project ref wjrwvempgjvoxlioodse), region us-east-1. The project was ACTIVE_HEALTHY during this read-only check and reported PostgreSQL 17.11.

The following is a read-only inventory. No database writes, migrations, policy edits, or function deployments were performed.

## Public tables

All four listed tables had Row Level Security enabled. The database tools reported zero rows in each table at the time of inspection.

### public.student_profiles

- id: UUID primary key and foreign key to auth.users.id.
- profile: JSONB, default empty object.
- created_at and updated_at: timestamp with time zone.
- RLS policy: Users manage their own profile; auth.uid() must equal id.
- App usage: not currently read or written by Scholarship Scout.

### public.scholarship_sources

- id: UUID primary key.
- owner_id: nullable UUID foreign key to auth.users.id.
- name, source_url, source_type, enabled, last_checked_at, created_at.
- RLS policy: Users manage their own sources; auth.uid() must equal owner_id.
- App usage: not currently read or written by the browser API.

### public.scholarships

- id: UUID primary key.
- owner_id: UUID foreign key to auth.users.id.
- source_id: nullable UUID foreign key to public.scholarship_sources.id.
- title, sponsor, official_url, award_min, award_max, currency, deadline.
- eligibility and evidence: JSONB.
- verification_status: text constrained to unverified, needs_review, verified, or rejected.
- created_at and updated_at.
- RLS policy: Users manage their own scholarships; auth.uid() must equal owner_id.
- App usage: the only public table currently used by scholarshipApi.ts. Reads and writes are explicitly filtered by the signed-in user's owner_id as defense in depth; RLS is the authorization boundary.

### public.eligibility_checks

- id: UUID primary key.
- owner_id: UUID foreign key to auth.users.id.
- scholarship_id: UUID foreign key to public.scholarships.id.
- result, matched_requirements, failed_requirements, unknown_requirements, evidence, checked_at.
- result is constrained to eligible, likely_eligible, needs_information, or ineligible.
- RLS policy: Users manage their own eligibility checks; auth.uid() must equal owner_id.
- App usage: not currently read or written. Personal eligibility assessments remain local.

## RLS policies and grants

The live policy inventory showed one permissive ALL policy per table, restricted to authenticated users and using the row-owner predicate:

- student_profiles: auth.uid() = id.
- scholarship_sources: auth.uid() = owner_id.
- scholarships: auth.uid() = owner_id.
- eligibility_checks: auth.uid() = owner_id.

Both USING and WITH CHECK were populated with the same owner condition for each policy.

Privilege checks confirmed:

- anon has no SELECT or INSERT privilege on any of the four public tables.
- authenticated has SELECT, INSERT, UPDATE, and DELETE privileges on each table.
- authenticated does not have TRUNCATE privilege on those tables.

This audit did not enumerate every possible anonymous table privilege bit, so consult the migration and project owner before asserting a complete ACL inventory.

No public-schema views or ordinary public-schema functions were returned by the read-only inventory query.

## Migration drift warning

The live migration history reported:

- 20261110044744 — initial_scholarship_scout_schema.
- 20261111020458 — restrict_anon_privileges_existing_tables.

The repository keeps `202611090001_scholarship_scout.sql` under `supabase/legacy/` because it describes an obsolete schema with `scholarship_profiles` and `scholarship_opportunities`, not the live four-table schema. It is deliberately outside the active migrations directory and must not be applied. The active `202611100001_restrict_anon_privileges.sql` file mirrors grant changes already applied to the live project. Reconcile checked-in and live migration histories before proposing future DDL.

## Advisor findings

Security advisor:
- WARN: Supabase leaked-password protection is disabled. Scholarship Scout currently uses email magic-link sign-in rather than password authentication. The project owner should enable leaked-password protection before enabling password-based login.

Performance advisor:
- INFO: foreign-key indexes were flagged for eligibility_checks.scholarship_id and scholarships.source_id.
- INFO: scholarships_owner_deadline_idx and eligibility_checks_owner_checked_idx were reported unused at the moment of the check.

No index changes were made. Unused-index findings are not, by themselves, justification to drop an index. Review query patterns, data volume, and migration parity first.
