# Code quality and runtime audit — November 28, 2026

## Executive result

The current GitHub `main` baseline is `28137158d8beb3243da295e3f4ffaf6676edfbd0`. One confirmed release-metadata defect was corrected in this PR: the frontend's deployed discovery version constant was 21 while the live Supabase function was version 29. Current documentation was reconciled with the verified deployment state.

No additional user-facing behavioral defect was reproduced from the read-only evidence available in this run. The audit did not change discovery behavior, local-vault behavior, cloud data contracts, database schema, RLS, Auth settings, secrets, or production deployments.

## Findings and changes

### CQ-001 — stale deployed discovery version metadata (P3, fixed)

`src/lib/liveDiscoveryCapabilities.js` declared `DEPLOYED_DISCOVERY_FUNCTION_VERSION = 21`, and its regression test asserted 21. Supabase reported `scholarship-discover` ACTIVE at version 29. The category allow-list itself was already correct, but the exported deployment metadata and its test were stale.

**Fix:** update the constant and its test expectation to 29. No category, request, or response behavior changes.

### CQ-002 — active documentation overstated backend drift (P2, fixed)

The current summaries variously described discovery v19, v20, or v28 and still claimed account deletion was v2 with source drift. Those statements no longer matched the live deployment.

**Evidence:** the live discovery function is v29 with `verify_jwt=false`; its complete five-file bundle matches the audited `main` baseline byte-for-byte. The live account-deletion function is v4 with `verify_jwt=true`; its entrypoint differs from `main` only in comments/formatting, and its `_shared/bounded-json-body.mjs` helper is byte-identical. Current summaries were corrected without rewriting dated historical audit records.

### CQ-003 — Upstash is not part of the active limiter

The deployed discovery wrapper imports `createPublicRateLimiter()`. It does not call `createUpstashRateLimiter()`, read Upstash settings, or require Upstash secrets. The active design is two requests per trusted IP per 60 seconds per Edge Function isolate, plus the authenticated single-process gateway's 30-request-per-60-second ceiling.

The optional Upstash implementation remains in the shared module as a documented future alternative. It was not removed in this PR because the open PR #31 also changes `supabase/functions/_shared/scholarship-discovery.mjs`, which re-exports that helper; changing the same runtime module would create avoidable overlap. No Redis configuration was read or changed.

### CQ-004 — database advisor findings require no immediate schema change

The live Supabase security advisor reports leaked-password protection disabled. The app currently uses magic links and Google OAuth, not password authentication; keep this warning tracked and enable the control before adding password sign-in.

The performance advisor reports four RLS init-plan warnings on `account_vault_backups`, but the live `pg_policies` definitions use `(select auth.uid())` and `(select auth.jwt())`, and migration `20261127183308_optimize_owner_rls_auth_initplan` is applied. The warning conflicts with the live policy expressions, so no RLS migration was justified. Three unused-index advisories were also returned; no index was removed without workload/query evidence. Health advisors returned no findings.

## Areas inspected

- Complete tracked-tree inventory and current repository instructions, README, architecture, anonymous-access, privacy/security, discovery, testing, deployment, and roadmap documentation.
- React/Vite entrypoints, the large active `src/App.tsx` workspace, bootstrap, resources page, app styles, local-vault implementation, discovery pipeline, and live-discovery capability contract.
- Supabase discovery and account-deletion entrypoints plus every file in their deployed source bundles.
- Current tests and CI configuration, package runtime constraints, active pull requests, and production deployment/domain metadata.
- Supabase migration inventory, live account-vault RLS policy expressions, and security/performance/health advisors.

The active `src/App.tsx` remains a large integration module. Open PR #31 is already extracting app responsibilities; PR #33 is working on stylesheet modularization. Both open PRs overlap on stylesheet and test files, so this automation avoided their changed-file sets rather than creating competing refactors.

## Verification

| Area | Result | Evidence |
|---|---|---|
| Main GitHub CI baseline | PASS | Run #97 succeeded on exact main SHA `28137158d8beb3243da295e3f4ffaf6676edfbd0`; Node 26.x setup, `npm ci`, audit, tests, and build steps all succeeded |
| Discovery source parity | PASS | All five deployed v29 files exactly match the audited main baseline |
| Account-delete source parity | PASS, executable | v4 entrypoint matches after comment removal; shared bounded-body helper is byte-identical; `verify_jwt=true` |
| Vercel production deployment | PASS | `dpl_Gj3jNiASBVqF3GhLwk23xaeaVk1j` is READY for the same main SHA |
| Domain configuration | PASS | Apex verified and attached; www verified with 308 redirect to apex |
| Vercel project `live` field | WARNING | Project metadata says false despite READY production deployment and attached aliases; not treated as outage |
| Supabase security advisor | WARNING | Leaked-password protection disabled; no password sign-in currently |
| Supabase performance advisor | REVIEW | RLS init-plan warning conflicts with current live policy expressions; three unused-index advisories need workload evidence |
| Supabase health advisor | PASS | No health lints |
| Public HTTP route smoke checks | NOT RUN | Public web fetch could not access the site in this run; domain metadata was verified, but homepage, sitemap, robots, and route HTTP statuses were not independently fetched |
| Local test/build commands | NOT RUN | No authorized repository shell was available or used; GitHub Actions is the verification source |

The main CI result is baseline evidence, not evidence for this PR. This PR remains unverified until GitHub Actions completes successfully on its exact head SHA. No production deployment was performed.

## Privacy, security, and migration impact

- Discovery continues to accept only state, graduation year, and selected category IDs.
- Student profile, grade, activity, essay, notes, eligibility, and application-preparation data remain local or client-encrypted under the existing opt-in backup flow.
- RLS, Auth/owner checks, age/guardian/consent gates, encrypted local vault, account deletion, URL validation, and server-only secrets were not changed.
- No database migration, secret, Auth setting, Edge Function deployment, or Vercel configuration was changed.
- No real student records, scholarship applications, sponsor emails, or account deletions were used.

## Remaining work

1. Complete the real-browser workflow matrix for legal/age gates, authentication callbacks, vault recovery, backup restore, offline recovery, cross-account isolation, and screen-reader behavior.
2. Resolve the overlapping stylesheet work in PRs #31 and #33 before further app/CSS modularization.
3. Recheck site-wide HTTP security headers and public route responses through an authorized HTTP/browser check.
4. Reconcile the Supabase advisor's RLS warning with its live optimized policies if it persists on a fresh advisor run; do not change policy SQL based only on the contradictory warning.
5. Revisit the dormant Upstash alternative only after the overlapping discovery-helper PR is settled and a concrete scale requirement justifies a shared store.

