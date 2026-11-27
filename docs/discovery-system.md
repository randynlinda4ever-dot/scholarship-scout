# Scholarship discovery system

> **Current runtime status — November 25, 2026:** Supabase is ACTIVE_HEALTHY and `scholarship-discover` is ACTIVE at version 10 (`verify_jwt=false`), with inspected inline source SHA-256 `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`. The most recent inspected traffic window showed seven HTTP 502 POSTs tagged version 9, latest `2026-11-25T15:04:10.559Z`; no version-10 request appeared in that result. This is historical v9 failure evidence, not a fresh v10 result. The AgentGrid implementation snapshot used for this source-parity comparison is revision `9eb1e1a99f70f2389a9d4875c48d802d1e5fa6c2`; its shared adaptive helper is not semantically equivalent to the deployed inline function. The dedicated SC-246 report and status-document refresh were committed as documentation-only revision `bd50d06fc873f4d28cbae60b74af0e2f5465030d`; those edits did not change product source. The local gateway and named-tunnel status were not freshly checked in this pass. See [the consolidated SC-246 report](sc246-gateway-recovery-2026-11-25.md) and [the Agent 03 audit](agent-03-search-discovery-audit-2026-11-25.md).

## Browser request boundary

The browser calls runLiveScholarshipDiscovery after reusing the Supabase session stored for the current browser or creating an anonymous Supabase Auth user when the visitor first runs research. No email or password is required. The client sends:

- State.
- Expected graduation year.
- Selected category IDs.

The search API does not send the student profile object, school, district, grades, class rank, test scores, activities, contact details, essay text, or notes.

The deployed public Edge Function is currently version 10 (`verify_jwt=false` for this function only). The browser sends only state, graduation year, and selected category IDs. The function validates its JSON request and allowlisted categories, uses a fixed HTTPS gateway and server-side bearer token, and does not accept an arbitrary destination URL from the browser. The inspected v10 inline source allows at most four selected categories and a request body up to 8 KiB. It has two query variations and up to two pages per category (up to 16 upstream calls for four categories), concurrency four, up to 15 results per page, a 40-result final cap, and a 12-second upstream timeout. Its per-isolate public limiter is best-effort (two requests per 60 seconds), not distributed. No CAPTCHA or independent provider fallback is present in this function.

## Current deployed capabilities

Direct Supabase inspection on November 25, 2026 found `scholarship-discover` ACTIVE at version 10, with deployed inline source SHA-256 `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`. The live v10 implementation still uses a fixed two-variation/two-page search plan for every selected category, up to 16 requests for four categories. It does not use the AgentGrid helper's adaptive stages, complete-result cache, bounded transient retry, or detailed failure-reason codes. It returns `unverified_lead` records; it does not confirm sponsor identity, award amounts, deadlines, or sponsor eligibility rules. Ranking and host signals are not sponsor verification.

The checked-in function entrypoint imports `supabase/functions/_shared/scholarship-discovery.mjs`. The shared helper has now been optimized with staged adaptive search, a 30-second per-isolate complete-result cache, one bounded retry for transient 429/5xx responses, response-level savings/cache/retry metrics, and canonical-URL/title deduplication. These helper changes and client metadata are committed in the AgentGrid artifact, but have **not** been deployed to Supabase. The active v9 inline source and checked-in helper are not established as equivalent; the version number does not prove code parity.

The inspected 24-hour function-edge log result contained seven HTTP 502 POSTs tagged version 9, latest `2026-11-25T15:04:10.559Z`. No version-10 invocation appeared in that result, so it does not establish the outcome of a fresh v10 request. Local SearXNG/gateway and named-tunnel health were not freshly checked in this pass. No new provider benchmark or production savings measurement was performed.

## Deployed facts versus repository source

The current version and deployed SHA above are facts from direct Supabase inspection. Detailed historical v8 behavior must not be attributed to v9. The adaptive algorithm, cache, retry, canonicalization, client-side dedupe, and response metrics described in this audit refer to the committed helper/client source only until a reviewed deployment is completed. Keep future documentation explicit about environment, version, and deployed source hash. Any deployment requires request/response contract review, privacy and gateway review, and fresh end-to-end smoke tests.

## Result handling in the browser

src/lib/discoveryPipeline.js:

- Rejects unsafe URLs.
- Canonicalizes safe HTTPS URLs and strips known tracking parameters.
- Normalizes titles and domains.
- Deduplicates repeated leads by canonical source URL and normalized title, merging their discovery provenance.
- Preserves discovery category/query/page provenance.
- Ranks leads using relevant terms and broad state/year matching.
- Keeps sponsor, award, deadline, and evidence fields unknown.
- Marks every live result unverified until a human checks the official sponsor source.

Tracker duplicate suggestions are separately classified as exact title match, strong similarity (85% or above), or possible similarity (80% through 84%). A shared normalized sponsor and valid deadline year are still required. The tracker presents both records with manual Review actions; it never merges, deletes, or changes either record automatically.

## Errors and partial results

The browser distinguishes authentication/configuration and live-search errors from an empty result set. The API rejects invalid result shapes instead of interpreting them as zero scholarships. The deployed function returns meaningful HTTP error responses for missing gateway configuration, invalid request data, failed gateway connection, non-success gateway response, and unreadable result JSON.

The client currently normalizes absent summary fields to zero because the older deployed v7 response does not include the expanded multi-query summary contract. That is a compatibility behavior, not proof that multiple queries were run.

## Planned improvements

- Deploy the expanded search implementation only after explicit approval and authenticated smoke tests.
- Align the live Edge Function and browser capability metadata through a shared versioned contract.
- Extend manual duplicate review with a reversible, privacy-safe user decision history only if there is a clear need.
- Improve ranking only with measured relevance signals and traceable reasons.
- Add pagination only where the deployed gateway contract supports it.
- Preserve the rule that a search result is a lead, not verification.
