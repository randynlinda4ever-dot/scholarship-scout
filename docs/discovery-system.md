# Scholarship discovery system

> **Current runtime status — November 27, 2026:** Supabase reports `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false`. The returned deployed entrypoint still uses the in-memory per-isolate limiter; the canonical AgentGrid wrapper uses the separate Upstash-backed limiter, so source parity is incomplete. An earlier request failed with four upstream DNS errors, but a later synthetic production search returned 40 leads and Supabase logged POST 200 at `05:09:06.848Z`. This proves one successful request, not sustained reliability. See [the current runtime audit](runtime-audit-2026-11-27.md).

## Browser request boundary

Public live discovery does not require a Supabase Auth session. The browser sends only:

- State.
- Expected graduation year.
- Selected category IDs (up to four).

The search request does not include the student profile object, school, district, grades, class rank, test scores, activities, contact details, essays, recommendation notes, or application tasks. Keep this boundary unchanged.

## Canonical search implementation

The AgentGrid source contains a shared discovery helper with:

- Fourteen allowlisted discovery categories.
- Two query variations per selected category, with bounded page expansion.
- Adaptive staged searches that stop expanding categories once they produce enough distinct leads.
- Bounded concurrency and per-request timeouts.
- One bounded retry for transient upstream 429/5xx failures.
- A short-lived cache for complete results only; incomplete responses are not cached.
- Canonical URL/title deduplication with merged category/query/page provenance.
- State/year relevance signals and explicit reasons.
- Partial-result summaries and failure classifications.
- Safe HTTPS result filtering and unverified-lead labeling.

Search results are leads, not verified scholarships. Sponsor identity, award amount, deadline, eligibility rules, and sponsor-check dates remain unknown until the official sponsor source is reviewed. Ranking is not an eligibility decision.

## Canonical rate limiting

The canonical Edge Function wrapper uses `createUpstashRateLimiter` from `supabase/functions/_shared/discovery-rate-limit.mjs`. It applies HMAC-derived client/IP keys, per-client and per-IP minute/day quotas, and per-IP/global concurrency leases. Configuration is read from bounded environment settings. The raw client address is not stored in Redis keys.

The canonical wrapper requires server-side `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` secrets. Missing or unavailable shared storage fails closed with HTTP 503; quota exhaustion returns HTTP 429 with `Retry-After`. Do not replace this with a per-isolate fallback in production.

## Current deployed/source difference

Supabase metadata reports version 19, but the returned deployed entrypoint imports and instantiates `createPublicRateLimiter()`, the per-isolate in-memory limiter. The deployed shared helper does include adaptive search, a complete-result cache, bounded retries, and detailed failure metrics. However, the current canonical wrapper imports the separate Upstash V2 module and passes that limiter into the handler. The returned deployed file set does not include the current separate rate-limit module or wrapper. This is a real source-parity gap; a matching or higher version number does not establish parity.

The Supabase response also reports an `entrypoint_path` suffix of `_16` despite version-19 metadata. Treat that as an additional provenance discrepancy, not proof that version 16 is running. The returned `ezbr_sha256` value is metadata and has not been independently recomputed from the source files.

## Current failure evidence

An earlier upstream failure was logged at `2026-11-27T02:48:55.575Z`: the configured host was `plugin-loan-anybody-drilling.trycloudflare.com`; four queries were attempted, none succeeded, and all four were classified `network_dns_error`.

A later read-only browser smoke check used synthetic Texas/2027/local inputs and returned 40 scholarship leads. Supabase `function_edge_logs` records a successful discovery POST at `2026-11-27T05:09:06.848Z`. No browser console/network errors were reported. This is one successful end-to-end request after the earlier DNS failure, not proof of sustained uptime or full category coverage.

The named-tunnel URL `https://discovery-gateway.scholarship-scout.org` is documented but was not directly health-checked. The successful request proves the configured gateway route worked at that time, but does not identify the configured hostname or prove its stability. Supabase secret values were not read or changed, and the connected Supabase integration does not expose a secret-write operation. Upstash secret presence is also unknown.

## Error and privacy contract

The function validates JSON content type and body size, normalizes a US state and a four-digit graduation year, enforces the category allowlist, and accepts no browser-supplied destination URL. Gateway credentials remain server-side. The function does not read or write student profile, scholarship, or eligibility tables. Search responses contain unverified leads and safe failure summaries; never return secrets or raw private student data.

The public endpoint uses `verify_jwt=false` by design. This is limited to public discovery. Cloud scholarship CRUD remains authenticated and owner-scoped by existing RLS policies.

## Release requirements

Before deploying the canonical wrapper:

1. Verify the named gateway route and token from their authoritative sources without printing either secret.
2. Verify both Upstash secrets exist and are valid; do not deploy the fail-closed wrapper without them.
3. Review the deployed/canonical diff and confirm the request/response contract and privacy boundary.
4. Record the AgentGrid revision and deployed source hash, plus the prior version and rollback procedure.
5. Run focused edge tests, the full application suite/build/audit, and a synthetic production POST with synthetic inputs.
6. Confirm partial-result behavior, 429/503 behavior, CORS preflight, and no private data or secrets in responses/logs.

## Browser result handling

The browser discovery pipeline:

- Rejects unsafe URLs.
- Canonicalizes safe HTTPS URLs and strips known tracking parameters.
- Normalizes titles and domains.
- Deduplicates repeated leads while merging discovery provenance.
- Preserves category/query/page provenance.
- Ranks leads using broad state/year and scholarship-relevance signals.
- Keeps sponsor, award, deadline, and evidence fields unknown until official-source review.
- Marks live results unverified.

Tracker duplicate suggestions are a separate local workflow. They do not merge, delete, or modify records automatically.
