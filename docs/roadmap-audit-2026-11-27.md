# Roadmap audit — November 27, 2026

## Scope and evidence

This was a read-only audit of the current GitHub production-source snapshot and its engineering documentation. No application code, test, dependency, database, Supabase setting, secret, Vercel setting, deployment, or student record was changed during the audit.

**Audited baseline**
- GitHub repository: `randynlinda4ever-dot/scholarship-scout`
- Branch and commit: `main` / `ae3577848c075cdfeececfa46537871fafc0a62c`
- Vercel project: `scholarship-scout-standalone`
- Production deployment observed: `dpl_HqHzXdVDB7gJtVG6nJsTFkeeSGep`, READY, from the same commit.
- Primary evidence: `README.md`, `AGENTS.md`, `GITHUB_REPOSITORY.md`, `docs/roadmap.md`, `docs/improvement-plan.md`, `docs/architecture.md`, `docs/runtime-audit-2026-11-27.md`, `docs/deployment.md`, `docs/discovery-system.md`, `docs/search-provider-evaluation.md`, `docs/security-hardening-2026-11-27.md`, `docs/testing.md`, `docs/privacy-and-security.md`, current navigation and route source, current CI workflow, and the search benchmark fixtures.

**Limitations**
- This audit did not execute the application, run the test suite, open a live browser, inspect private student records, or invoke the production Supabase function.
- Production deployment metadata and code documentation were inspected, but live runtime behavior was not re-proven.
- The original audit inspected the production `main` snapshot only. A follow-up inspection on November 27, 2026 also checked the separate local Resources feature checkout: it contains five interactive tools, encrypted local-vault persistence, version-3 encrypted-backup support with version-1/version-2 import compatibility, and route/navigation integration. The local checkout's recorded test/build result is 786 passed, 0 failed, 0 skipped, with TypeScript/Vite build passing. These changes remain uncommitted on `feature/my-scholarships-audit-20261127`, are not in GitHub `main` or production, and must be reconciled against current `main` before release. The implementation is not a maintained searchable catalog; catalog metadata, source-review lifecycle, filtering, bookmarking, and a full real-browser acceptance pass remain open.
- Findings below distinguish committed source, documented service state, and owner-reported work. Historical QA numbers are not treated as proof for the current commit.

## Executive assessment

Scholarship Scout already has a strong privacy-conscious foundation: local encrypted student/application data, user-controlled encrypted backups, public scholarship discovery without requiring an account, owner-scoped cloud scholarship records, explicit source evidence, pass/fail/unknown eligibility, application preparation, and manual submission controls.

The biggest risks are not a lack of features. They are evidence gaps between source and production, unmeasured search quality, fragmented roadmap documentation, unfinished real-browser verification, and a large active UI component that increases the cost of further feature work.

The highest-value direction is to turn the existing feature set into one dependable student journey rather than expanding the product surface indiscriminately.

## Findings

| Priority | Finding | Evidence and impact | Recommended treatment |
|---|---|---|---|
| P0 | Discovery source parity is not proven | The runtime/deployment reports record Supabase `scholarship-discover` at version 19 while the corrected release candidate is not byte-identical to the deployed file set. A direct gateway HTTP 200 is not proof of a Supabase-to-gateway request. Students can encounter production behavior different from reviewed source. | Make exact backend source comparison, synthetic function invocation, failure-mode checks, and rollback a P0 release gate. |
| P0 | Real-browser evidence is incomplete | Current docs list outstanding browser checks for backup restore, auth callbacks, RLS isolation, offline behavior, account deletion, and assistive-technology behavior. Source tests do not establish browser behavior. | Build and maintain a reproducible browser acceptance matrix with synthetic data and independent test accounts. |
| P0 | Security owner actions remain open | Security docs record unresolved `supabase_admin` default privileges and production HTTP response-header gaps. The meta CSP cannot supply all required HTTP headers. CAPTCHA/Turnstile is not currently wired to public discovery. | Assign an owner, verify live ACL/header state, and implement abuse controls based on the real deployment threat model. |
| P1 | Search quality is not sufficiently measured | The 100-intent benchmark has no relevance labels. The six-query golden set has nine expected-source anchors; the documented baseline retrieved four. Ranking metrics exist but cannot be meaningfully interpreted without reviewed judgments. | Complete human relevance judgments and source/claim mappings before changing providers or claiming major ranking gains. |
| P1 | Resources is implemented locally but not released; the catalog remains incomplete | Production `main` still has no Resources route. A separate local feature branch contains five interactive student tools with encrypted vault persistence and version-3 backup support; its recorded suite is 786/0/0 and its TypeScript/Vite build passes. The changes are uncommitted and not on GitHub. The feature is not yet a maintained searchable catalog with catalog-level bookmarks, source ownership/review states, and filters. | Reconcile the local implementation onto current `main`, review it, run the full release gates and browser acceptance matrix, then release separately. Track catalog search/filtering, editorial source lifecycle, and bookmarks as follow-on work. |
| P1 | The student journey is fragmented | Discovery, tracker, application preparation, profile, and settings exist, but no unified prioritized action center combines deadlines, incomplete tasks, pending recommendations, saved resources, and source-review needs. | Add a small "Next steps" experience using existing data rather than creating a new parallel workflow system. |
| P1 | Roadmap documentation is stale and duplicated | `docs/roadmap.md` opens with a November 24 recovery overlay and historical test counts; `docs/improvement-plan.md` overlaps many phases and contains old deployment/function versions and inconsistent statuses. | Make one current roadmap authoritative, retain the older plan as historical context, and move dated verification evidence into release/audit reports. |
| P1 | Anonymous Auth requirements are inconsistently described | Older planning text treats Anonymous Sign-Ins as a requirement for live search. Current README and architecture describe public discovery without a Supabase Auth session; cloud scholarship CRUD separately requires authenticated ownership. | Do not add anonymous Auth merely to enable public search. Decide separately whether anonymous users should be allowed to save cloud sponsor records, and design retention/CAPTCHA only if that product capability is chosen. |
| P2 | Active frontend complexity is high | The active `src/App.tsx` is approximately 186 KB and `src/App.css` approximately 83 KB. Modular feature/page files exist, but architecture docs say the active workspace is still primarily loaded through the monolithic component. | Incrementally wire cohesive route modules with stable contracts and tests; avoid a large rewrite. |
| P2 | Performance work lacks a current measured baseline | Older reports include bundle-size advisories and historical performance observations, but there is no current benchmark in this audit for route load, interaction responsiveness, mobile memory, vault write cost, or large tracker lists. | Measure current behavior on named devices and synthetic datasets before introducing memoization, caching, or code splitting. |
| P2 | Operational rate limits are topology-specific | The documented design uses per-isolate Edge limits and one gateway process cap. Counters are not durable/distributed and the process cap resets on restart; replicas would have independent counters. | Keep the current simple design for the current topology; add a central coordinator only before adding replicas or materially increasing traffic. |
| P2 | Data-model lifecycle needs disciplined extension | Resources/bookmarks, reminders, and future sync would add new local record types and backup responsibilities. | Require versioned backup compatibility, migration tests, delete/export semantics, and local-first privacy review for every new student-owned data type. |
| P2 | Runtime/documentation version drift is a risk | `.nvmrc`, CI, and `package.json` require Node 26, but the current `README.md` setup section still says Node 22.12+. Historical QA/test totals also vary by source revision. | Correct the README runtime requirement, audit remaining setup documentation for the same mismatch, and keep test evidence tied to exact commits. |
| P3 | Multi-device sync is a major architectural expansion | Student data is intentionally local and the vault is at-rest encryption, not end-to-end synchronization. Sync introduces key recovery, conflict, deletion, and shared-device risks. | Keep local-only mode; research user need and threat-model an opt-in client-encrypted design before implementation. |
| P3 | Automated sponsor monitoring could create false confidence | Verification is currently manual and the verification Edge Function is a disabled placeholder. Automated extraction may misread sponsor rules or old cycles. | Prototype change detection as a review queue only; never auto-verify or silently change eligibility. |

## Corrections to the previous roadmap

1. **Remove stale status overlays and historical counts.** The November 24 checklist is useful historical evidence, not the current roadmap. Test results must be recorded against exact current commits.
2. **Separate frontend build status from backend availability.** Vercel READY proves that a frontend deployment built. It does not prove Supabase source parity or successful discovery through the deployed function.
3. **Correct the public-search/Auth dependency.** Search is designed to work without a Supabase Auth session. Anonymous Auth may be relevant to an optional cloud-save product decision, not public discovery itself.
4. **Do not make Upstash/Redis mandatory for the present single-gateway topology.** The current documented decision deliberately uses a per-isolate edge limit plus one gateway process cap. Add shared coordination only when scale or topology justifies it.
5. **Do not add more search providers before measuring the current one.** The project has a strong evaluation structure but incomplete judgments.
6. **Do not mark Accessibility complete forever.** Prior checks are useful historical evidence; every materially changed screen still needs focused keyboard, screen-reader, contrast, zoom, motion, and responsive testing.
7. **Distinguish the interactive Resources tools from a maintained resource catalog.** The local feature branch already has route/navigation behavior, encrypted-vault persistence, version-3 backup support with older-backup compatibility, printable/shareable tools, and focused regression coverage. Those changes are not yet merged or production-reviewed, and the full browser acceptance pass remains open. A searchable catalog, catalog-level bookmarks, source ownership/review lifecycle, filtering, and ongoing link-quality operations are still unimplemented.
8. **Keep one current priority source.** The refreshed `docs/roadmap.md` is authoritative. The older `docs/improvement-plan.md` should not compete with it until its statuses are reconciled or it is explicitly archived.

## Additional opportunities added to the roadmap

- A curated and maintained student resource catalog, distinct from scholarships.
- Resource bookmarks and completion state in the local encrypted vault and encrypted backups.
- A unified student action center that composes existing scholarship and application data.
- Student-controlled local reminders and calendar export with correct date-only/timezone semantics.
- Human-judged benchmark data and segmented search metrics.
- A maintained scholarship-program catalog with cycle-aware records and source provenance.
- Incremental frontend modularization with route and domain boundaries.
- Measured bundle, interaction, storage, and search optimization.
- Gateway scale-up triggers, safe data lifecycle handling, and versioned backup migration.
- Explicit bug triage, regression-test-first fixes, preview verification, rollback, and post-release checks.
- Long-term financial-aid/college planning and optional client-encrypted cross-device continuity, both gated on user need and privacy review.

## Recommended execution order

1. Close P0 backend parity, real-browser, security-owner, and release-evidence gaps.
2. Finish and review the Resources feature as a separate product branch; keep the catalog separate from scholarship records.
3. Human-grade the search benchmark and use it to guide a measured discovery iteration.
4. Connect the existing product areas with a student action center and controlled reminders.
5. Modularize the active frontend and optimize only measured bottlenecks.
6. Research longer-term catalog, college-planning, sponsor-monitoring, and opt-in sync capabilities after the core experience is reliable.

## Audit conclusion

The project does not need an indiscriminate feature expansion. It needs a trustworthy release path, measurable discovery quality, a maintained Resources experience, and a connected application workflow. These improvements compound: better evidence improves search, better resources help students act on results, and an action center turns separate tools into a usable process while preserving local student-data control.
