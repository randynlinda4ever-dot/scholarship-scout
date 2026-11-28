# Search algorithm implementation — November 27, 2026

## Implemented in this change

The production search handler now builds three complementary query intents per selected discovery category (up to four categories and two bounded pages per intent). Adaptive expansion is based on distinct, opportunity-specific candidates rather than distinct URLs alone: at least five candidates must show an award signal and a minimum combination of student-audience, application, geographic, graduation-year, or institutional-host cues before a category can stop expanding.

The scheduler caps actual gateway HTTP attempts, including retries, at 24 per discovery run. It reserves retry capacity before a stage and can disable retries for the last stage when doing so permits full stage coverage without exceeding the cap. Existing four-request concurrency, 22-second total time budget, safe URL handling, transient retry controls, caching, and unverified-lead safeguards remain in place.

Results from the three SearXNG query variants are combined using Reciprocal Rank Fusion (RRF, rank constant 60). Query rank is preserved across pages, and the API exposes a bounded search_consensus_score and search_consensus_count. These represent agreement between query variants from the same SearXNG provider; they are not independent-provider consensus, source authority, verification, or eligibility.

The browser-side matcher expands a small curated set of profile concepts (for example, community service to volunteering/civic engagement/public service) locally. Detailed profile fields are not added to the discovery request. The server continues to receive only state, graduation year, and selected category IDs.

The evaluation module now supports graded relevance judgments (0–3) and calculates Precision@10, nDCG@10, MRR@10, Recall@50, and judged-result coverage. Ranking metrics are macro-averaged across judged queries. When no relevance judgments exist, the metrics are explicitly unavailable.

## Benchmark status

tests/fixtures/search/benchmark-intents.json contains 100 representative query intents spanning all 14 discovery categories and multiple states, graduation years, and education levels. It is a query-coverage corpus, not a human-judged quality benchmark: all relevance judgments remain pending. The existing curated expected-source anchors continue to measure retrieval recall, but they do not by themselves provide sufficient relevance judgments to claim Precision@10 or nDCG improvements.

Before declaring a search-quality lift, collect blinded, human-reviewed 0–3 relevance judgments for the 100 intents, annotate sponsor authority and application-cycle evidence separately, then compare the baseline and new implementation with paired query runs. Report per-category metrics and judgment coverage, not only aggregate scores.

## Deliberately not claimed or deployed

This change does not add embedding-based vector retrieval, a Cross-Encoder, parallel multi-provider fan-out, or a populated public scholarship program/cycle/source index. Those require a reviewed public-catalog data model and ingestion/provenance pipeline, an independently evaluated provider or embedding service, and infrastructure configuration that is not present in the current SearXNG-only production path. It would be misleading to claim the current RRF stage is full semantic hybrid search.

No Supabase migration, secret, live Edge Function, gateway configuration, Vercel production alias, or production dataset was changed. The implementation is committed to the canonical GitHub source repository and must pass release-branch checks and an end-to-end Supabase-to-gateway preview test before deployment.
