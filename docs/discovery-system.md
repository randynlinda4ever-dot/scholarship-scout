# Scholarship discovery system

> **Current limiter decision — November 27, 2026:** The current release design uses the existing no-Redis architecture: two requests per IP per 60 seconds per Edge Function isolate, backed by the authenticated single gateway's 30-request-per-60-second process-wide ceiling. Upstash is not required. The gateway owner confirms the two SearXNG secrets are configured, and a direct authenticated request to the named tunnel returned HTTP 200 with 15 results. Supabase remains at version 19 until reviewed source parity is deployed and re-verified. See [the current runtime audit](runtime-audit-2026-11-27.md).

## Browser request boundary

Public live discovery does not require a Supabase Auth session. The browser sends only:

- State.
- Expected graduation year.
- Selected category IDs (up to four).

The search request does not include the student profile object, school, district, grades, class rank, test scores, activities, contact details, essays, recommendation notes, or application tasks. Keep this boundary unchanged.

## Canonical search implementation

The AgentGrid source contains a shared discovery helper with:

- Fourteen allowlisted discovery categories.
- Three complementary query intents per selected category, with up to two bounded pages per intent and a 24-upstream-attempt cap that includes retries.
- Adaptive staged searches stop only after five distinct, opportunity-specific candidates pass the quality threshold; URL volume alone is insufficient.
- Reciprocal Rank Fusion (RRF, k=60) combines ranked SearXNG query-variant lists while preserving page positions and consensus metadata.
- A small curated concept expansion improves local profile matching; detailed profile matching remains in the browser.
- Bounded concurrency and per-request timeouts.
- One bounded retry for transient upstream 429/5xx failures.
- A short-lived cache for complete results only; incomplete responses are not cached.
- Canonical URL/title deduplication with merged category/query/page provenance.
- State/year relevance signals and explicit reasons.
- Partial-result summaries and failure classifications.
- Safe HTTPS result filtering and unverified-lead labeling.

Search results are leads, not verified scholarships. Sponsor identity, award amount, deadline, eligibility rules, and sponsor-check dates remain unknown until the official sponsor source is reviewed. Ranking is not an eligibility decision.

## Selected rate limiting

The production wrapper uses `createPublicRateLimiter()` from `supabase/functions/_shared/discovery-rate-limit.mjs`. It trusts only Cloudflare's `cf-connecting-ip` value, limits each IP to two requests per 60-second window per Edge Function isolate, and fails closed with HTTP 503 when no trusted client address is available. A quota hit returns HTTP 429 with `Retry-After`. The browser's `x-scout-client-id` header is permitted by CORS but is not trusted as an identity.

The authenticated Node gateway provides the shared upstream layer: its single process caps authorized `/search` requests at 30 per 60 seconds across all Supabase Edge Function isolates. This no-Redis design requires only the existing `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` secrets. It does not provide durable daily quotas or a shared in-flight concurrency lease, and its counter resets on a gateway process restart. `createUpstashRateLimiter` remains optional alternative code; it is not used by the production wrapper and no Upstash secrets are required.

## Current deployed/source difference

Supabase metadata reports version 19. Its returned deployed entrypoint uses the per-isolate in-memory limiter, and the helper includes adaptive search, a complete-result cache, bounded retries, and detailed failure metrics. The corrected release wrapper preserves the same per-isolate policy, adds `x-scout-client-id` to CORS, and imports the limiter from the separate shared module. The source still contains optional Upstash code, but the production wrapper does not activate it and no Redis secrets are required. The deployed v19 file set is not byte-identical to the current release source; the missing module and CORS wrapper change still need a reviewed deployment.

The Supabase response also reports an `entrypoint_path` suffix of `_16` despite version-19 metadata. Treat that as an additional provenance discrepancy, not proof that version 16 is running. The returned `ezbr_sha256` value is metadata and has not been independently recomputed from the source files.

## Current failure evidence

An earlier upstream failure was logged at `2026-11-27T02:48:55.575Z`: the configured host was `plugin-loan-anybody-drilling.trycloudflare.com`; four queries were attempted, none succeeded, and all four were classified `network_dns_error`.

A later read-only browser smoke check used synthetic Texas/2027/local inputs and returned 40 scholarship leads. Supabase `function_edge_logs` records a successful discovery POST at `2026-11-27T05:09:06.848Z`. No browser console/network errors were reported. This is one successful end-to-end request after the earlier DNS failure, not proof of sustained uptime or full category coverage.

The gateway owner confirms `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` are configured. Without printing the token, an authenticated request using the local token source reached `https://discovery-gateway.scholarship-scout.org` and returned HTTP 200 with 15 results. The saved Quick Tunnel hostname `plugin-loan-anybody-drilling.trycloudflare.com` failed and is stale. This validates current named-tunnel reachability from the laptop, not an invocation from the deployed Supabase function. The connected Supabase integration does not expose a secret read/write operation. Upstash credentials are not required by the selected design.

## Error and privacy contract

The function validates JSON content type and body size, normalizes a US state and a four-digit graduation year, enforces the category allowlist, and accepts no browser-supplied destination URL. Gateway credentials remain server-side. The function does not read or write student profile, scholarship, or eligibility tables. Search responses contain unverified leads and safe failure summaries; never return secrets or raw private student data.

The public endpoint uses `verify_jwt=false` by design. This is limited to public discovery. Cloud scholarship CRUD remains authenticated and owner-scoped by existing RLS policies.

## Release requirements

Before deploying the corrected wrapper:

1. Preserve the gateway bearer token server-side; owner confirmation and the authenticated named-tunnel check are recorded without exposing it.
2. Review the per-isolate IP limiter, shared 30-per-minute gateway ceiling, CORS preflight, and fixed gateway request/response contract.
3. Review all deployed/candidate files, including `_shared/discovery-rate-limit.mjs`, and preserve the existing v19 rollback snapshot.
4. Run focused Edge tests, the full application suite/build/audit, and a synthetic Supabase function POST using only state, graduation year, and category IDs.
5. Confirm partial-result behavior, Edge Function 429/503 behavior, gateway 429 behavior, and that no private data or secrets appear in responses/logs.
6. Record the GitHub commit, synchronized AgentGrid revision, deployed source hash, and prior-version rollback steps.

## Browser result handling

The browser discovery pipeline:

- Rejects unsafe URLs.
- Canonicalizes safe HTTPS URLs and strips known tracking parameters.
- Normalizes titles and domains.
- Deduplicates repeated leads while merging discovery provenance.
- Preserves category/query/page provenance.
- Re-ranks leads locally using state/year, private profile concept matches, and bounded consensus across query variants.
- Keeps sponsor, award, deadline, and evidence fields unknown until official-source review.
- Marks live results unverified.

Tracker duplicate suggestions are a separate local workflow. They do not merge, delete, or modify records automatically.
