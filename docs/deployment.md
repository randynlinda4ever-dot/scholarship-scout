# Deployment and release controls

> **Current deployment status — November 27, 2026:** AgentGrid is the canonical application source. The runtime source snapshot inspected for this audit was revision `5a17758a431188a270bf94d1201a87d49734ef71`; subsequent audit commits changed tests/docs only. Supabase reports `scholarship-discover` ACTIVE at version 19. The returned deployed wrapper still uses the in-memory per-isolate limiter rather than the canonical Upstash-backed wrapper. An earlier request failed with DNS errors, but a later production smoke test returned 40 leads and Supabase logged discovery POST 200 at `05:09:06.848Z`. No Edge Function deployment or production secret change was performed. See [the current runtime audit](runtime-audit-2026-11-27.md).

## Source and environments

- Canonical frontend and Edge Function source: the existing AgentGrid artifact `Y9kTsZ0-vazOq3AnWspbAw`.
- Existing Supabase project: `wjrwvempgjvoxlioodse`.
- Supabase function: `scholarship-discover`, reported ACTIVE at version 19 with `verify_jwt=false` for public discovery only.
- Vercel is not the canonical source or deployment control for this project and was not used in this audit. Do not infer current production state from an old Vercel deployment.
- AgentGrid artifact commits update canonical source; they do not automatically prove that the public domain or Supabase Edge Function is running that revision.

## Current backend deployment

The Supabase function response returned an entrypoint that imports `createPublicRateLimiter()`, the in-memory per-isolate limiter. The returned deployed helper contains adaptive search, a complete-result cache, and bounded retries, but the wrapper does not use the canonical Upstash V2 module.

The current AgentGrid wrapper imports `createUpstashRateLimiter` and `getDiscoveryRateLimitConfig` from `supabase/functions/_shared/discovery-rate-limit.mjs`. It requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, uses distributed client/IP quotas and concurrency leases, and allows `x-scout-client-id` through CORS. The returned deployed file set does not contain that module/wrapper. Source parity is incomplete.

An earlier failure log at `2026-11-27T02:48:55.575Z` showed four upstream DNS failures against `plugin-loan-anybody-drilling.trycloudflare.com`. A later production smoke test returned 40 leads, and Supabase logged a successful discovery POST at `2026-11-27T05:09:06.848Z`. This is a single successful request, not a sustained-uptime guarantee. The named-tunnel URL in prior documentation was not directly health-checked. Neither gateway secret nor either Upstash secret was read or changed; the connected Supabase integration does not expose a secrets read/write action.

Do not deploy the canonical wrapper until:

1. The current gateway URL and bearer token are reconciled from authoritative sources without printing either secret.
2. Both Upstash secrets are verified as present and valid.
3. The deployed/canonical source diff and request/response contract are reviewed.
4. The prior deployed version, source hash, and rollback path are recorded.
5. A synthetic end-to-end request proves the gateway and function path.

The canonical wrapper intentionally fails closed with HTTP 503 when the shared limiter is unavailable. Do not bypass this control or substitute the in-memory fallback in production.

## Release requirements

Before declaring a release ready:

1. Resolve the latest AgentGrid revision and record its full commit hash.
2. Run `npm ci` from the committed lockfile.
3. Run `npm test` and record pass/fail/skip counts.
4. Run `npm run build` and review TypeScript and Vite output.
5. Run `npm audit --audit-level=moderate`.
6. Run focused Edge Function tests, including CORS, 429/503 behavior, retries, partial results, and source URL safety.
7. Run a synthetic production POST with only state, graduation year, and selected category IDs.
8. Verify public search, source review, local save/restore, cloud owner isolation, and sign-in/session behavior in a real browser.
9. Check keyboard operation, screen-reader names/status, responsive layouts, and offline behavior.
10. Confirm no private student data or secrets appear in requests, responses, logs, or client bundles.

A green build is not proof of working discovery. A successful search is not proof that every result is a legitimate or currently open scholarship.

## Data and migration safeguards

- Preserve local-first student data and the current discovery payload boundary.
- Preserve Supabase RLS and owner-scoped cloud scholarship CRUD.
- Do not apply `supabase/legacy/202611090001_scholarship_scout.sql`; it is incompatible with the existing schema.
- Reconcile live migration history before any schema change.
- Review actual query patterns before adding or removing indexes.
- Do not enable password auth without first enabling leaked-password protection.
- Do not introduce automatic sponsor contact or application submission.

## Rollback

Keep AgentGrid changes in focused commits. Artifact history retains earlier committed revisions; restore a previous source revision if a frontend change causes a regression. Supabase Edge Function rollback must use the recorded prior deployed source and version, not an assumed match to an AgentGrid commit. Database changes require a separate migration-specific rollback plan. No production deployment, secret update, database migration, or RLS change was performed during the November 27 audit.
