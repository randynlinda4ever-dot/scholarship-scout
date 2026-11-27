# Search provider contract and quality evaluation

**Status:** Contract and deterministic evaluation harness added; provider integration is not changed.  
**Curated query set:** tests/fixtures/search/golden-queries.json (six public-source queries; curation date 2026-11-25).

## Purpose and boundary

The existing discovery function is SearXNG-backed. This work introduces a provider-neutral contract and a repeatable quality evaluator without changing the live Edge Function's provider selection, secrets, gateway, cache, request payload, or deployment. Search results remain unverified leads. The contract does not establish sponsor identity, eligibility, award amount, or deadline truth.

The golden set uses public government, university, city, school-foundation, and official program pages. It contains no student profile data. Expected sources are recall anchors rather than an exhaustive catalog. The fixture's curatedAt date records when the URL/claim mapping was checked; it is not a source publication date and is never counted as freshness evidence.

## Provider-neutral response contract

A provider exposes { name, search(request) }. The request contains only:

- query: bounded search text.
- limit: result cap.
- maxAgeDays and asOf: optional source-date evaluation context.
- signal: cancellation signal.

The provider response contains status, results, optional providerRequestId, and an optional structured error. Provider results are normalized to title, canonical HTTPS url, snippet, and an array of provenance records:

- provider and provider request ID;
- retrieval timestamp;
- published and updated timestamps, when actually supplied;
- canonical and original URL;
- content hash, when supplied;
- freshness classification: fresh, stale, future, unknown, or dated.

The provider name is assigned by the adapter, not trusted from provider result content. Unsafe URLs, malformed records, and empty titles are dropped. Duplicate canonical URL/title pairs merge provenance rather than losing the source trail.

## Status and fallback behavior

| Status | Meaning | Fallback |
|---|---|---|
| success | Valid results returned | Stop when the minimum result threshold is met |
| partial | Some provider work succeeded but coverage is incomplete | Continue within provider/deadline bounds |
| empty | Valid response with no usable results | Continue |
| rate_limited | Provider quota or rate limit | Continue; no unbounded retry |
| unavailable | Network/provider outage | Continue |
| timeout | Provider or total deadline elapsed | Continue only if the global deadline remains |
| cancelled | Caller cancelled | Stop immediately; never call another provider |
| error | Provider/protocol error | Stop when marked non-retryable; otherwise continue |

Fallback is sequential and capped by maxProvidersToTry, each provider has a timeout, and the overall operation has a deadline. This layer does not add automatic repeated retries inside providers; any provider-specific retry policy must remain bounded and separately tested.

## Cache and freshness semantics

Only complete success responses are cached. Cache keys include normalized query, limit, max-age policy, as-of date, provider order, and adapter cache version. Cache TTL is measured from retrieval and exposed as cache.ageMs; cached retrieval timestamps are preserved rather than rewritten to look new.

Source freshness is a separate concept. It uses an actual provider-supplied updatedAt or publishedAt date. Missing dates remain unknown; future dates are not fresh; a retrieval timestamp or fixture curation date is not substituted for a publication date. The evaluator counts undated returned results as not fresh and reports the unknown count separately.

## Golden-query metrics

Each query has expected official/institutional source URLs and claim mappings.

- **Supporting-source recall:** expected supporting source URLs retrieved / expected supporting source URLs.
- **Citation accuracy:** citations whose source is explicitly mapped to support the cited claim / citations evaluated. No citations means N/A.
- **Freshness compliance:** returned results with a valid, non-future publication/update date within the source's maximum age / returned results assessed. Undated results count as not fresh and are also counted in freshnessUnknown.
- **Duplicate rate:** redundant canonical URL + normalized-title results / returned results.

Aggregate metrics are weighted by their numerator/denominator counts, not by averaging query percentages. A zero denominator is N/A, not a pass. Search retrieval alone does not prove that a source supports a claim; the citation mapping must be independently curated.

## Provider comparison status

The shared contract suite exercises three deterministic provider-shaped fixtures: SearXNG-style, Brave-style, and Tavily-style payload mappings. It tests normalization, provenance, fallback, rate limits, outages, timeout, cancellation, bounded provider count, duplicate merging, and cache freshness. These are contract fixtures, **not live provider API integrations or quality benchmarks**. No new search dependency, API key, external account, provider secret, or live fallback was added.

The existing SearXNG implementation remains the only configured live provider. A real provider decision requires authorized server-side credentials and live tests against the same golden query set, with source recall, citation support, freshness, duplicate rate, latency, failure rate, privacy boundary, and operating cost compared under the same conditions. Do not integrate a provider based on raw result count or fixture compatibility alone.

## Release gates proposed for a live comparison

These are proposed acceptance thresholds, not measured results:

- supporting-source recall >= 0.90;
- citation accuracy >= 0.95;
- freshness compliance >= 0.95;
- duplicate rate <= 0.05;
- cancellation and fallback-bound compliance = 1.00.

Report per-query and aggregate results, with N/A values preserved. A provider that cannot supply publication/update dates may still be useful for discovery, but it cannot claim freshness compliance from retrieval timestamps.

## Verification limitations

The product source artifact supports inspection and commits but does not provide an authorized Node/npm execution environment. Product tests/build therefore remain NOT RUN until an authorized Node runner is available. Desktop Commander is restricted to local Apex runtime work and must not be used for Scholarship Scout product tests. No deployment, publication, provider configuration, secret access, database change, or live search request was performed for this work.
