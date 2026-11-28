# Engineering documentation index

These documents describe the verified implementation and distinguish current behavior from proposed work.

- [Product and engineering roadmap](roadmap.md) — authoritative priorities for student value, release integrity, Resources, discovery, bug fixes, and optimization.
- [Roadmap audit — November 27, 2026](roadmap-audit-2026-11-27.md) — evidence-based review of the previous roadmap, current gaps, stale assumptions, and recommended execution order.
- [Search visibility and public scholarship guides](search-visibility.md) — crawlable scholarship landing pages, canonical routes, sitemap/robots configuration, privacy boundaries, and indexing verification.
- [Runtime audit — November 27, 2026](runtime-audit-2026-11-27.md) — GitHub release state, Supabase v19 source parity, gateway validation, database advisors, and release gates.
- [Rate-limit decision — November 27, 2026](rate-limit-decision-2026-11-27.md) — current no-Redis design, verified gateway ceiling, explicit limitations, and future scale-up triggers.
- [Recovery status — November 25, 2026](recovery-status-2026-11-25.md) — historical SC-054 reconciliation, earlier deployed-source parity, gateway failure, and release gates.
- [Recovery status — November 24, 2026](recovery-status-2026-11-24.md) — earlier local checkpoint and clean-install evidence.

- [Architecture](architecture.md) — frontend, data flow, local/cloud boundaries, and deployed/source gaps.
- [Anonymous access](anonymous-access.md) — anonymous Supabase sessions, browser persistence, abuse controls, and limitations.
- [Database schema](database-schema.md) — live tables, RLS policies, grants, migration drift, and advisor findings.
- [Discovery system](discovery-system.md) — current deployed search contract, result handling, and planned improvements.
- [Search algorithm implementation — November 27, 2026](search-algorithm-implementation-2026-11-27.md) — expanded query planning, quality-aware stopping, SearXNG-variant RRF, local concept expansion, ranking metrics, and explicit limitations.
- [Search provider evaluation](search-provider-evaluation.md) — provider-neutral adapter contract, golden-query metrics, bounded fallback, cache freshness, and provider-comparison limits.
- [Eligibility engine](eligibility-engine.md) — supported rules, outcome precedence, explanations, and known gaps.
- [Verification system](verification-system.md) — source evidence lifecycle and disabled verification placeholder.
- [Methodology and result labels](methodology.md) — plain-language explanation of discovery, source quality, eligibility outcomes, evidence thresholds, and limitations.
- [Privacy and security](privacy-and-security.md) — local-first data, cloud boundary, security controls, and owner actions.
- [Security hardening — November 27, 2026](security-hardening-2026-11-27.md) — local vault, database default-privilege status, CSP, CI supply-chain controls, and production/hosting risks.
- [Supabase owner security runbook — November 27, 2026](supabase-owner-security-runbook-2026-11-27.md) — owner-only SQL, discovery gateway/limiter deployment, rollback, and hosting-header follow-ups.
- [Backup format](backup-format.md) — envelope, crypto parameters, validation, and compensated restore process.
- [Testing](testing.md) — unit, integration, E2E, accessibility, and performance verification.
- [Deployment](deployment.md) — release controls, environment assumptions, and rollback.
- [API reference](../public/api-docs.html) — deployed API contracts, authentication, data boundaries, and errors; machine-readable discovery is at `/.well-known/api-catalog`.
- [QA report](qa-report.md) — verified findings, focused test evidence, and remaining blockers.
- [Improvement plan](improvement-plan.md) — historical phased upgrade plan; consult the new roadmap for current priorities.
