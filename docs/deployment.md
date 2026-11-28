# Deployment and release controls

## Source and environments

- Canonical frontend and repository source: GitHub `randynlinda4ever-dot/scholarship-scout`, branch `main`.
- Production frontend: Vercel project `scholarship-scout-standalone`.
- Public app domains: `https://scholarship-scout.org` and `https://www.scholarship-scout.org`; the `www` host redirects to the apex domain.
- Supabase project: `wjrwvempgjvoxlioodse`.
- Public discovery function: `scholarship-discover`, verified ACTIVE at version 29 with `verify_jwt=false` for public discovery only.
- Account deletion function: `account-delete`, verified ACTIVE at version 4 with `verify_jwt=true` and the bounded 2 KiB streaming body reader plus shared helper in the deployed bundle.

A production frontend deployment must identify the exact GitHub commit it built. A READY status alone does not verify that the intended commit was deployed. The frontend deployment does not deploy Supabase Edge Functions or database migrations.

## Current frontend release

Vercel production deployment `dpl_Gj3jNiASBVqF3GhLwk23xaeaVk1j` is READY and was built from GitHub `main` SHA `28137158d8beb3243da295e3f4ffaf6676edfbd0`. The verified apex and `www` domains are attached to that deployment; `www.scholarship-scout.org` is configured to redirect to the apex with HTTP 308.

Vercel project metadata currently reports `live=false` while the exact-main production deployment is READY and the custom-domain aliases remain attached. Treat that field as an inconsistent project summary, not proof of an outage. The deployment's explicit `target=production`, Git SHA, READY state, and aliases are the stronger evidence.

## Current backend deployment

The deployed `scholarship-discover` v29 entrypoint uses the in-memory per-isolate rate limiter, and all five deployed files match the audited GitHub `main` baseline byte-for-byte. The authenticated SearXNG gateway enforces a shared 30-upstream-request-per-60-second process ceiling across Edge Function isolates. The optional Upstash helper is not wired or used; no Redis credentials are required. This design does not provide durable daily quotas or shared in-flight concurrency leases.

The deployed `account-delete` function is ACTIVE at v4 with `verify_jwt=true`. Its deployed bundle was verified to include `readBoundedJsonBody(request, 2048)` and the shared helper. No real or destructive account deletion was run as a smoke test.

Required discovery secrets are `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN`. Verify that they exist without reading or printing their values. A successful authenticated request to the gateway confirms gateway reachability, not a fresh end-to-end Supabase invocation.

Do not deploy the discovery Edge Function until:

1. The gateway URL and bearer token remain server-side.
2. The per-isolate limiter, gateway-wide request ceiling, browser CORS header, and fixed gateway request contract are reviewed.
3. The deployed/candidate source diff is reviewed, including every Edge Function dependency file.
4. The prior deployed source files, metadata, and rollback path are preserved.
5. A synthetic end-to-end Supabase POST proves the function-to-gateway path before production deployment.

The Edge Function fails closed with HTTP 503 when it cannot attribute a trusted client IP. The gateway independently rejects excess global request volume with HTTP 429. Do not bypass either control. Upstash can be reconsidered only as a separately approved scale-up design, with a staging service and tests.

## Current database security snapshot — November 28, 2026

The live audit found RLS enabled on all five public tables. The local-only `student_profiles` and `eligibility_checks` tables have no direct `anon` or `authenticated` CRUD grants; `service_role` retains server-side access. Authenticated CRUD grants on `scholarships`, `scholarship_sources`, and `account_vault_backups` remain protected by owner-scoped RLS. The live `postgres` defaults do not grant table, sequence, or function privileges to `anon` or `authenticated`.

Supabase's internal `supabase_admin` defaults remain visible in `pg_default_acl`, but the live ownership audit found zero current `public` objects owned by that role. These internal defaults are not customer-editable and apply only to objects that `supabase_admin` creates. Do not add an unexecutable owner-scoped SQL script or attempt to assume this role. Keep extensions in `extensions` or another non-exposed schema and recheck object ownership after extension or platform changes. See [Supabase's managed default-privilege guidance](https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema-448af9).

## Release requirements

Before declaring a frontend release ready:

1. Fetch the latest `origin/main` and create a focused branch from its exact commit.
2. Run `npm ci`.
3. Run `npm test` and record pass/fail/skip counts.
4. Run `npm run build` and review TypeScript and Vite output.
5. Run `npm audit --audit-level=moderate`.
6. Review the PR diff for unexpected files, deletions, credentials, and student data.
7. Confirm GitHub CI passes against the exact PR head.
8. Verify the Vercel preview built from that exact candidate commit.
9. Merge the reviewed PR and verify the resulting `main` commit.
10. Verify the Vercel production deployment's Git SHA matches the merged commit.
11. Verify the production aliases and custom domain.
12. Smoke-test critical routes and any authentication or discovery flows included in the change.

Backend releases have separate gates: review Edge Function source and dependencies, verify required secret names without exposing values, validate RLS and migration scope, run relevant backend tests, and confirm the deployed function version and rollback source.

A green frontend build is not proof of working discovery. A successful search is not proof that every result is a legitimate or currently open scholarship.

## Data and migration safeguards

- Preserve local-first student data and the current discovery payload boundary.
- Preserve Supabase RLS and owner-scoped cloud scholarship CRUD.
- Do not apply `supabase/legacy/202611090001_scholarship_scout.sql`; it is incompatible with the existing schema.
- Reconcile live migration history before any schema change.
- Review actual query patterns before adding or removing indexes.
- Do not enable password auth without first enabling leaked-password protection.
- Do not introduce automatic sponsor contact or application submission.

## Rollback

Use the prior production deployment and its exact source commit for frontend rollback. Supabase Edge Function rollback must use the recorded prior deployed source and version, not an assumed match to a GitHub commit. Database changes require a separate migration-specific rollback plan.
