# Runtime audit — November 27, 2026

## Source of truth

The canonical Scholarship Scout application is the AgentGrid artifact `Y9kTsZ0-vazOq3AnWspbAw`. The latest AgentGrid HEAD inspected during the reconciliation pass is `336ed785daedcf4ba02650d79786545bee6a2edf`. The commits after the earlier `5a17758a` runtime snapshot did include application changes (including tracker/workspace capacity, profile validation, discovery error handling, and obsolete enrollment-control removal) as well as tests and documentation; the earlier sentence that later commits changed tests/docs only was incorrect. GitHub release base `6147370a94499a69ef47dd9fee0677e0cd3abec3` is preserved on the separate branch `release/reconciliation-2026-11-27`. AgentGrid is the canonical authoring source; GitHub is the collaboration/release mirror; Vercel is the frontend hosting/deployment target, not a source. See [the source reconciliation record](source-reconciliation-2026-11-27.md).

## Live Supabase function

The existing Supabase project is `wjrwvempgjvoxlioodse`. Supabase reports `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false`. That public-invocation setting applies only to this discovery endpoint; it does not make cloud CRUD or other functions public.

The current Supabase function inspection returned an entrypoint that imports `createPublicRateLimiter` and passes it to the handler. That is the in-memory, per-isolate limiter. The returned deployed shared helper does contain adaptive staged search, a short-lived complete-result cache, bounded retries, and failure metrics, but its entrypoint is not wired to the current canonical shared limiter.

The canonical AgentGrid source has a different production wrapper: it imports `createUpstashRateLimiter` and `getDiscoveryRateLimitConfig` from the separate `supabase/functions/_shared/discovery-rate-limit.mjs` module, configures distributed client/IP quotas and concurrency leases, and allows the `x-scout-client-id` header through CORS. Its required server-side settings are `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The deployed file set returned by Supabase does not contain that separate module and does not use that wrapper. Source parity is therefore not established, even though some adaptive-search behavior is present in the deployed helper.

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

The named-tunnel URL `https://discovery-gateway.scholarship-scout.org` appears in earlier project documentation, but its current direct reachability was not independently established. The successful end-to-end search proves that the configured route worked for one request; it does not prove which hostname was configured or whether the route will remain stable. The stored `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` values were not read or changed. The connected Supabase integration exposes no Edge Function secret read/write action. The two Upstash secret values/presence were also not verified.

**Do not deploy the canonical Upstash wrapper until the required Upstash secrets are verified, the gateway URL/token are reconciled securely, and a rollback path is documented.** The current wrapper intentionally fails closed with HTTP 503 if the shared rate-limit store is missing or unavailable; do not weaken that behavior to make discovery appear available.

## Database advisors

The current Supabase advisors returned:

- Security warning: leaked-password protection is disabled. The current sign-in experience is magic-link based; enable this control before introducing password authentication.
- Performance information: missing covering indexes on `eligibility_checks.scholarship_id` and `scholarships.source_id`.
- Performance information: `scholarships_owner_deadline_idx` and `eligibility_checks_owner_checked_idx` are currently reported unused.
- Health advisors: no findings.

No database schema, index, RLS policy, grant, or authentication setting was changed. Do not add or remove indexes solely to silence the advisor: first establish real query patterns and table growth.

## Canonical-source regression found and corrected

The current `src/App.tsx` footer contains the visitor-facing product name and description, with no internal alpha release label. `tests/uiPolishRegression.test.mjs` still expected the footer to contain `Alpha 0.8`, while `tests/applicationPrepPageClutter.test.mjs` explicitly expects that label to be absent. The stale test assertion was updated to check the actual public footer contract.

A second regression guard was added to assert that the canonical production Edge Function wrapper uses the shared Upstash limiter, validates its configuration through the typed configuration reader, and exposes the client-id header. This protects the canonical source from silently reverting to the in-memory limiter. It does not prove that the live Supabase deployment has been reconciled.

## Verification limits

This audit inspected the exact Library report, the current AgentGrid source revision, deployed Supabase function metadata/source, recent function logs, and current database advisors. It made no production deployment, secret, database, auth, or RLS changes.

The current Node test suite, TypeScript/Vite build, and dependency audit were not executed because this session did not expose an authorized project shell/test runner. The new test assertions were statically checked against the current source, but that is not a substitute for `npm test`. The production domain was rendered in a read-only browser smoke check, and one public search succeeded; this was not a complete browser workflow. Authentication, cloud-owner isolation, backup restore, screen-reader speech, and sustained discovery reliability remain unverified.

## Prioritized next work

1. Reconcile the earlier DNS failure with the later successful production request. Verify the current gateway route and the two gateway secrets from their authoritative sources without exposing either value; confirm the named tunnel is the configured durable endpoint.
2. Verify both Upstash secrets, review the canonical wrapper/helper diff, then deploy the canonical Edge Function with a recorded source revision/hash and rollback plan. The single successful request does not remove the distributed-rate-limit/source-parity requirement.
3. Run the full current-revision test/build/audit gate and synthetic end-to-end discovery checks. Then complete browser workflows for search, source review, local save/restore, and cloud-owner isolation.
4. Add public bot protection and operational uptime alerting only after the gateway and distributed rate limit are stable.
5. Revisit database indexes only when the corresponding foreign-key query patterns are active; do not remove the currently unused indexes without workload evidence.

## Follow-up security hardening — November 27, 2026

A separate security follow-up applied migration `20261127052519_restrict_public_default_privileges_for_postgres`. It removed future-object grants to `anon` and `authenticated` for `public` tables, sequences, and functions created by `postgres`. The live `pg_default_acl` query confirms the change and retains `service_role` defaults. The defaults owned by `supabase_admin` remain unchanged because the connected `postgres` SQL role is not a member of `supabase_admin`; that owner-level follow-up remains open.

AgentGrid source now has a restrictive meta CSP, SHA-pinned GitHub Actions, PR dependency review, and Dependabot configuration. Hosting response headers remain unverified, and the source test/build workflow has not been run in this session. See [security hardening update](security-hardening-2026-11-27.md).
