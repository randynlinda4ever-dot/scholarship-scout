# Deployment and release controls

> **Reconciliation status — November 27, 2026:** AgentGrid HEAD `336ed785daedcf4ba02650d79786545bee6a2edf` is the canonical source inspected. GitHub release branch `release/reconciliation-2026-11-27` is the reviewed mirror. Vercel is the production frontend host and deployment target, with GitHub as its release input. Supabase discovery version 19 uses the per-isolate limiter; the corrected release candidate adopts the same no-Redis behavior plus the existing authenticated gateway's process-wide 30-request/minute cap. The gateway's two server-side secrets are owner-confirmed as configured, and the named tunnel passed a direct authenticated HTTP 200/15-result check from the laptop. No backend or production deployment was performed. See [the source reconciliation record](source-reconciliation-2026-11-27.md).

## Source and environments

- Canonical frontend and Edge Function source: the existing AgentGrid artifact `Y9kTsZ0-vazOq3AnWspbAw`.
- Existing Supabase project: `wjrwvempgjvoxlioodse`.
- Supabase function: `scholarship-discover`, reported ACTIVE at version 19 with `verify_jwt=false` for public discovery only.
- AgentGrid remains the canonical authoring source. GitHub (`randynlinda4ever-dot/scholarship-scout`) is the collaboration/release repository, and the Vercel project `scholarship-scout-standalone` is the production frontend host for `scholarship-scout.org` and `www.scholarship-scout.org`. Verify the Vercel production-branch setting directly before relying on it; historical notes about the branch are not current deployment evidence. Deployments are built from GitHub commits. A successful Vercel deployment verifies only the frontend bundle, not Supabase Edge Function source parity or live discovery reliability.
- AgentGrid artifact commits update canonical source; they do not automatically prove that the public domain or Supabase Edge Function is running that revision.

## Current backend deployment

The deployed Supabase v19 entrypoint imports and injects `createPublicRateLimiter()`, the in-memory per-isolate limiter. Its helper contains adaptive search, a complete-result cache, and bounded retries. The corrected release wrapper keeps the same limiter policy, imports it from the separate shared rate-limit module, and adds `x-scout-client-id` to CORS; it does not activate Upstash. Deployed v19 source parity still needs a reviewed update.

The corrected GitHub release wrapper imports `createPublicRateLimiter` from `supabase/functions/_shared/discovery-rate-limit.mjs`, preserves the `x-scout-client-id` CORS header, and uses the existing fixed HTTPS SearXNG gateway. It has no Redis/Upstash dependency. The gateway enforces a shared 30-upstream-request-per-60-second process ceiling across Edge Function isolates. The design does not supply durable daily quotas or shared in-flight concurrency leases. The deployed v19 file set is still not byte-identical to the release candidate; source parity remains a reviewed deployment gate.

An earlier failure log at `2026-11-27T02:48:55.575Z` showed four upstream DNS failures against the obsolete Quick Tunnel hostname `plugin-loan-anybody-drilling.trycloudflare.com`. The owner confirms `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` are configured. Without exposing the token, an authenticated local request to `https://discovery-gateway.scholarship-scout.org` returned HTTP 200 with 15 results; the old Quick Tunnel hostname failed. This confirms direct named-tunnel reachability from the laptop, not a fresh Supabase invocation. No Redis/Upstash secrets are part of the selected deployment design.

Do not deploy the canonical wrapper until:

1. The gateway URL and bearer token remain server-side; owner confirmation and the authenticated named-tunnel check are recorded without revealing either value.
2. The per-isolate limiter, gateway-wide 30-per-minute ceiling, browser CORS header, and fixed gateway request contract are reviewed.
3. The deployed/candidate source diff is reviewed, including every Edge Function dependency file.
4. The prior deployed v19 source files, metadata, and rollback path are preserved.
5. A synthetic end-to-end Supabase POST proves the function-to-gateway path before production deployment.

The Edge Function fails closed with HTTP 503 when it cannot attribute a trusted client IP. The gateway independently rejects excess global request volume with HTTP 429. Do not bypass either control. Upstash can be reconsidered only as a separately approved scale-up design, with a staging service and tests.

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
11. Verify the Vercel preview built from the exact candidate commit, including its entry document, referenced assets, browser behavior, and critical discovery flow. Promote that same verified deployment to production only after every release gate passes, then confirm the production aliases and custom domain.

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
