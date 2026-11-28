# Runtime audit — November 27, 2026

## Source and runtime boundaries

GitHub `main` is the sole source of truth for Scholarship Scout application code. This document is a historical inspection record of the Supabase runtime and application release state on November 27, 2026. The revision identifiers retained below describe historical snapshots only; they are not alternate sources or synchronization targets.

Vercel hosts the frontend. Supabase runs authentication, database, and Edge Functions. These services must be checked independently. See [the source reconciliation record](source-reconciliation-2026-11-27.md) for the GitHub-only policy and [deployment controls](deployment.md) for the current release procedure.

## Live Supabase function

The existing Supabase project is `wjrwvempgjvoxlioodse`. Supabase reports `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false`. That public-invocation setting applies only to this discovery endpoint; it does not make cloud CRUD or other functions public.

The deployed v19 entrypoint injects an in-memory `createPublicRateLimiter`; the deployed helper contains adaptive staged search, a short-lived complete-result cache, bounded retries, and failure metrics. The corrected historical implementation snapshot wrapper keeps the same per-isolate limiter policy, imports it from the separate shared rate-limit module, and adds the `x-scout-client-id` CORS allowance. The behaviour is deliberately no-Redis. The deployed file set remains different and must be reviewed before a function update.

The corrected historical implementation snapshot wrapper uses `createPublicRateLimiter()` from `supabase/functions/_shared/discovery-rate-limit.mjs`, allows `x-scout-client-id` through CORS, and retains the same per-isolate IP limit as deployed v19. It deliberately does not require Upstash. The authenticated single-process gateway supplies a shared 30-request-per-minute upstream ceiling across Edge Function isolates. The deployed v19 file set is not byte-identical to the corrected wrapper, so source parity remains a reviewed deployment gate.

The Supabase metadata reports version 19, while the returned `entrypoint_path` contains an internal path suffix of `_16`. Its `ezbr_sha256` metadata value is `824617afc4a5b8886424ecd6ad624c302fd3d2ccf2c5fe9993ac1fb59080f2af`. This metadata/path discrepancy is recorded as a provenance warning; it does not by itself prove which historical revision is running. Do not infer source parity from the version number or this metadata hash.

## Discovery failure and recovery evidence

An earlier upstream failure was logged at `2026-11-27T02:48:55.575Z`:

- Gateway host: `plugin-loan-anybody-drilling.trycloudflare.com`
- Requested queries: 4
- Successful queries: 0
- Failed queries: 4
- Failure classification: `network_dns_error`

That was an upstream gateway name-resolution failure, not evidence of a ranking or eligibility-engine defect.

A later read-only production browser smoke check on `scholarship-scout.org` used synthetic inputs only: Texas, graduation year 2027, and the local category. The UI reported **40 scholarship leads**, displayed the message that each official sponsor page should be reviewed, and reported no browser console/network errors. Supabase `function_edge_logs` records `POST | 200` to `/functions/v1/scholarship-discover` at `2026-11-27T05:09:06.848Z`; the corresponding function boot was at `05:09:04.485Z`. This corroborates one successful public search through the Supabase endpoint after the earlier DNS failures. It does not establish sustained uptime, complete category coverage, or exact gateway-host provenance.

The browser smoke check also entered a synthetic profile (Texas, 2027, high-school senior) and reported that it was saved locally in the automation browser. It did not sign in or add a scholarship record. Treat that as local test data in the browser session, not as a cloud profile save.

The owner confirms `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` are configured. Without printing the token, an authenticated request using the local token source reached `https://discovery-gateway.scholarship-scout.org` and returned HTTP 200 with 15 results. The saved Quick Tunnel hostname `plugin-loan-anybody-drilling.trycloudflare.com` failed and is stale. This confirms current named-tunnel reachability from the laptop, not an invocation from the deployed Supabase function. The connected Supabase integration exposes no Edge Function secret read/write action. Upstash credentials are not required by the selected design.

**Do not introduce a mandatory Upstash dependency for the current single-gateway design.** Preserve the per-isolate IP throttle and the authenticated gateway's 30-request-per-minute process cap. The Edge Function returns HTTP 503 when it cannot attribute a trusted IP and HTTP 429 when its isolate quota is exceeded; the gateway independently returns HTTP 429 above its process ceiling. The gateway counter resets on restart and has no shared in-flight concurrency lease.

## Database advisors

The current Supabase advisors returned:

- Security warning: leaked-password protection is disabled. The current sign-in experience is magic-link based; enable this control before introducing password authentication.
- Performance information: missing covering indexes on `eligibility_checks.scholarship_id` and `scholarships.source_id`.
- Performance information: `scholarships_owner_deadline_idx` and `eligibility_checks_owner_checked_idx` are currently reported unused.
- Health advisors: no findings.

No database schema, index, RLS policy, grant, or authentication setting was changed. Do not add or remove indexes solely to silence the advisor: first establish real query patterns and table growth.

## Canonical-source regression found and corrected

The current `src/App.tsx` footer contains the visitor-facing product name and description, with no internal alpha release label. `tests/uiPolishRegression.test.mjs` still expected the footer to contain `Alpha 0.8`, while `tests/applicationPrepPageClutter.test.mjs` explicitly expects that label to be absent. The stale test assertion was updated to check the actual public footer contract.

A second regression guard was added to assert that the production Edge Function wrapper uses the selected per-isolate IP limiter, allows the client-id header through CORS, and does not require Upstash configuration. The optional Upstash implementation remains tested separately but is not activated by the current production wrapper. The regression guard does not prove that the live Supabase deployment has been reconciled.

## Verification limits

This audit inspected the exact Library report, the current reviewed source revision at the time, deployed Supabase function metadata/source, recent function logs, and current database advisors. It made no production deployment, secret, database, auth, or RLS changes.

The corresponding GitHub release checkout containing the same corrected Edge Function wrapper and regression tests was validated on November 27: `npm ci` passed; `npm test` reported 730 passed, zero failed, zero skipped; `npm run build` completed TypeScript checking and Vite bundling; `npm audit --audit-level=moderate` found zero vulnerabilities; and `git diff --check` passed. The frontend preview was also rendered in isolated headless Chrome with no console errors or HTTP failures, but no consent, sign-in, or student workflow was submitted. Authentication, cloud-owner isolation, backup restore, spoken screen-reader behavior, and fresh Supabase-to-gateway invocation remain unverified.

## Prioritized next work

1. Push the corrected, fully tested wrapper and supporting documentation from the dedicated GitHub release branch; verify its code matches validated source revision recorded in this historical report.
2. Review and deploy the corrected Supabase Edge Function as a separate backend change, preserving `verify_jwt=false` only for this intentionally public endpoint and recording the new function version/source hash.
3. Invoke the deployed function using synthetic state/year/category inputs only. Verify CORS preflight, successful gateway results, per-isolate 429/Retry-After, fail-closed 503 for an unattributed client IP, and gateway 429 at its process cap.
4. Complete browser workflows for source review, local save/restore, cloud-owner isolation, sign-in, responsive accessibility, and account deletion before considering production promotion.
5. Revisit a shared coordinator only before adding gateway replicas or materially increasing traffic. Revisit database indexes only when their corresponding query patterns are active.

## Follow-up security hardening — November 27, 2026

A separate security follow-up applied migration `20261127052519_restrict_public_default_privileges_for_postgres`. It removed future-object grants to `anon` and `authenticated` for `public` tables, sequences, and functions created by `postgres`. The live `pg_default_acl` query confirms the change and retains `service_role` defaults. The defaults owned by `supabase_admin` remain unchanged because the connected `postgres` SQL role is not a member of `supabase_admin`; that owner-level follow-up remains open.

The reviewed GitHub source then had a restrictive meta CSP, SHA-pinned GitHub Actions, PR dependency review, and Dependabot configuration. Hosting response headers remain unverified. The full Node test/build/audit gate was run on the corresponding GitHub release checkout with the same corrected wrapper and tests. See [security hardening update](security-hardening-2026-11-27.md).

## Follow-up limiter and gateway implementation review — November 27, 2026

The earlier recommendation to activate Upstash was revised after the owner clarified that the SearXNG gateway secrets were configured but the two Upstash secrets were not. Inspection of `C:\Users\levih\searxng-local\gateway\server.mjs` confirmed a single-process ceiling of 30 authenticated `/search` requests per 60 seconds. The Supabase v19 entrypoint already uses a two-per-minute per-IP isolate limiter. The mandatory Upstash wiring in the GitHub candidate was an unnecessary dependency for this single-gateway topology and would fail closed with HTTP 503 when its Redis credentials were absent.

The GitHub release candidate is now corrected to retain the in-memory per-isolate limiter and use the existing gateway ceiling as its shared upstream bound. The browser client-id CORS header remains permitted. Upstash code stays optional and inactive. There is no durable daily quota or gateway-wide in-flight concurrency lease; the process ceiling resets on restart. This limitation is explicit in `docs/rate-limit-decision-2026-11-27.md`.

The owner confirms the two SearXNG gateway secrets are configured. An authenticated local request using the local token source returned HTTP 200 with 15 results at `https://discovery-gateway.scholarship-scout.org`. The saved Quick Tunnel hostname failed, confirming it is stale. Neither secret value was printed or changed. The connected Supabase integration still exposes no secrets-list/write action and no function-invocation action.

The current Supabase function remains ACTIVE at version 19 and its deployed source file set has not been changed. The v19 rollback snapshot is preserved at `C:\Users\levih\Documents\ScholarshipScout-rollback\2026-11-27\scholarship-discover-v19`. Production source parity and a fresh Supabase-to-gateway smoke test remain open gates.