# Deployment and release controls

## Source and environments

- Canonical frontend and repository source: GitHub `randynlinda4ever-dot/scholarship-scout`, branch `main`.
- Production frontend: Vercel project `scholarship-scout-standalone`.
- Public app domains: `https://scholarship-scout.org` and `https://www.scholarship-scout.org`; the `www` host redirects to the apex domain.
- Supabase project: `wjrwvempgjvoxlioodse`.
- Public discovery function: `scholarship-discover`, last independently checked at version 19 with `verify_jwt=false` for public discovery only.

A production frontend deployment must identify the exact GitHub commit it built. A READY status alone does not verify that the intended commit was deployed. The frontend deployment does not deploy Supabase Edge Functions or database migrations.

## Current frontend release

The PR #10 auth/mobile fix was merged to `main` as commit `4ad05b60356b10aeb9338ca384a2081f595e1f13`. Vercel production deployment `dpl_EsvKbRSVNZWzNnpkS3LNJbauVYRt` was verified READY for that exact commit, with both production domain aliases attached.

The mobile follow-up in the current branch is not yet part of production until its own pull request is reviewed, merged, and deployed.

## Current backend deployment

The deployed Supabase v19 entrypoint uses the in-memory per-isolate rate limiter. The reviewed GitHub implementation keeps that same limiter behavior and uses the existing authenticated SearXNG gateway. It does not require Redis/Upstash. The gateway enforces a shared 30-upstream-request-per-60-second process ceiling across Edge Function isolates. This design does not supply durable daily quotas or shared in-flight concurrency leases.

Required server-side secrets are `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN`. Verify that they exist without reading or printing their values. A recent authenticated request to `https://discovery-gateway.scholarship-scout.org` returned HTTP 200 with 15 SearXNG results. This confirms gateway reachability, not a fresh end-to-end Supabase invocation.

Do not deploy the discovery Edge Function until:

1. The gateway URL and bearer token remain server-side.
2. The per-isolate limiter, gateway-wide request ceiling, browser CORS header, and fixed gateway request contract are reviewed.
3. The deployed/candidate source diff is reviewed, including every Edge Function dependency file.
4. The prior deployed v19 source files, metadata, and rollback path are preserved.
5. A synthetic end-to-end Supabase POST proves the function-to-gateway path before production deployment.

The Edge Function fails closed with HTTP 503 when it cannot attribute a trusted client IP. The gateway independently rejects excess global request volume with HTTP 429. Do not bypass either control. Upstash can be reconsidered only as a separately approved scale-up design, with a staging service and tests.

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
