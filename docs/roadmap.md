# Scholarship Scout product and engineering roadmap

**Roadmap review date:** November 27, 2026  
**Baseline:** GitHub `main` at `ae3577848c075cdfeececfa46537871fafc0a62c`; Vercel production deployment `dpl_HqHzXdVDB7gJtVG6nJsTFkeeSGep` was reported READY from that commit during this review.  
**Companion audit:** [Roadmap audit — November 27, 2026](roadmap-audit-2026-11-27.md)

This is the prioritized product and engineering plan. It replaces the stale checklist previously in this file. Historical implementation evidence remains in the linked testing, QA, runtime, security, and deployment reports; checkboxes below describe future work, not claims that a task has already passed.

## Product direction

Scholarship Scout should help students move through one coherent journey:

1. Understand what funding and support may be available.
2. Discover relevant opportunities and trustworthy student resources.
3. Check each opportunity against sponsor rules without guessing.
4. Organize application requirements and complete the work.
5. Track deadlines, submissions, decisions, and next steps.
6. Retain control of personal data and recover their work.

The product should optimize for useful, trustworthy student outcomes rather than raw search-result count, feature count, or time spent in the app.

## Non-negotiable product and engineering rules

- Keep student profiles, grades, activities, eligibility assessments, essays, recommendations, application tasks, notes, bookmarks, and other student-specific context local by default.
- The public discovery request remains limited to state, expected graduation year, and selected category IDs. Do not add GPA, school, major, profile text, contact information, or other student data to that request.
- Cloud scholarship records remain owner-scoped through Supabase RLS. Do not expand cloud storage to student profiles or application workspaces without a separate opt-in privacy, encryption, recovery, and conflict-resolution design.
- A search result is an unverified lead. Do not infer sponsor identity, award amount, deadline, current-cycle status, eligibility, or source freshness.
- Eligibility outcomes remain distinct: pass, fail, and unknown. Missing or ambiguous information is not a failure.
- Sponsor-source verification and student eligibility are separate concepts. A verified source does not guarantee an award.
- Never submit applications, contact sponsors, send recommendation requests, or upload student documents automatically.
- Do not add a mandatory provider, database, queue, Redis service, or analytics platform without measured need, a privacy review, and a rollback plan.
- Never apply the incompatible migration in `supabase/legacy/`. Reconcile live migration history before any schema change.
- No production database, auth, secrets, Edge Function, domain, hosting-header, or deployment change is implied by a roadmap checkbox. Use a separate reviewed release and explicit approval for production actions.

## Priority and status conventions

**Priority**
- **P0 — release integrity:** privacy, security, data integrity, core availability, or release-blocking correctness.
- **P1 — core student value:** discovery, resources, eligibility, application progress, and important usability.
- **P2 — scale and maintainability:** resilience, performance, architecture, observability, and operational efficiency.
- **P3 — strategic expansion:** valuable capabilities that depend on validated earlier phases.

**Status**
- **Verified complete:** evidence exists for the current reviewed revision and the relevant environment.
- **In progress:** active implementation; not complete until reviewed and accepted.
- **Proposed:** recommended future work.
- **Blocked:** depends on an external owner, service, or decision.
- **Needs revalidation:** previously implemented or tested, but the current revision or production behavior has not been verified.

Do not carry a completed checkbox forward merely because an older report checked it. Record the commit, test result, environment, and verification date for completion.

---

## P0 — Release integrity, privacy, and reliability

These items take precedence over adding more search providers or large product features.

### P0.1 Reconcile frontend and discovery backend source

- [ ] Compare the exact deployed `scholarship-discover` Edge Function file set with the reviewed GitHub release source; record a file-level diff and source hash.
- [ ] Resolve the documented Supabase version-19 source-parity discrepancy. A version number or a successful direct gateway request is not proof that the deployed Edge Function is invoking the current gateway.
- [ ] Review the complete Edge Function dependency set, CORS contract, fixed gateway destination, server-side token handling, request bounds, timeout/retry policy, partial-result behavior, and failure classifications.
- [ ] Preserve the existing deployed version and a tested rollback procedure before any function update.
- [ ] Deploy only through a separately reviewed backend release. Record the deployed function version, source hash, commit, and rollback target.
- [ ] Run synthetic end-to-end requests through the deployed Supabase function using only state, graduation year, and allowed category IDs.
- [ ] Verify success, partial results, CORS preflight, rate-limit 429 with `Retry-After`, and fail-closed 503 when a trusted client IP cannot be attributed.
- [ ] Confirm that gateway secrets, student data, and raw sensitive request content never appear in browser bundles, responses, or logs.

**Acceptance:** the reviewed source is byte-for-byte or otherwise demonstrably equivalent to the deployed dependency set; synthetic Supabase-to-gateway requests pass; privacy and failure-mode assertions pass; rollback is documented and usable.

### P0.2 Complete the real-browser release matrix

- [ ] Verify public discovery while signed out; public search must not require an unnecessary anonymous Auth session.
- [ ] Verify local profile, tracker, checklist, essay, and application-workspace persistence across reloads.
- [ ] Verify encrypted backup export, import preview, wrong-password handling, corrupted-file rejection, and successful restore without data loss.
- [ ] Verify vault lock, unlock, inactivity lock, failed-write recovery, and the single-unlocked-tab rule.
- [ ] Verify magic-link and Google OAuth flows, callback restoration, sign-out, account deletion, and session revocation where applicable.
- [ ] Verify cloud scholarship ownership with two independent test accounts. Confirm one account cannot read, update, or delete another account's records.
- [ ] Verify offline behavior: local work remains available, online-only controls are disabled clearly, and recovery after reconnect does not silently lose changes.
- [ ] Verify the same flows at desktop and mobile viewport sizes using synthetic student data.
- [ ] Record browser, OS, commit, environment, exact workflow, result, and defects. Do not treat source tests or a Vercel READY state as proof of these flows.

**Acceptance:** all critical workflows pass in a real browser; no cross-account access, data loss, silent failed writes, broken callback, or unexplained test skip remains.

### P0.3 Close security and deployment-owner follow-ups

- [ ] Resolve the owner-level Supabase default-privilege finding for objects created by `supabase_admin`; verify the resulting ACL rather than treating an attempted SQL command as success.
- [ ] Configure and verify hosting response security headers at the actual production domain. A meta CSP is not a substitute for HTTP response headers such as HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- [ ] Review CSP allowlists against the actual app and preview embedding requirements. Do not blindly block required preview parents or weaken script policy.
- [ ] Keep public discovery abuse controls bounded. Add server-side CAPTCHA/Turnstile only when the abuse model and deployment path are designed and tested; never rely on client-only checks or CORS as bot protection.
- [ ] Define data retention and cleanup for any anonymous Auth accounts or cloud sponsor rows if that capability is intentionally enabled. Anonymous Auth is not a prerequisite for unauthenticated public search.
- [ ] Reconcile active migration history before future database DDL. Preserve the incompatible legacy migration as historical material; never apply it.
- [ ] Confirm no password-based authentication is introduced before the relevant leaked-password protection and account-recovery controls are enabled.
- [ ] Review account deletion and local-data clearing copy so users understand that locally stored vault data cannot be remotely erased by the server.

**Acceptance:** unresolved security findings have a named owner and verified disposition; production headers and Supabase privileges are checked in the live environment; public abuse controls are proportionate to measured risk.

### P0.4 Keep the release pipeline trustworthy

- [ ] Require focused pull requests and review; do not push unreviewed feature work directly to protected `main`.
- [ ] For each code change run `npm ci`, `npm test`, `npm run build`, and `npm audit --audit-level=moderate`.
- [ ] Record passing, failing, and skipped test counts. A skipped test must have a clear reason, owner, and follow-up; do not silently accept skipped release coverage.
- [ ] Run focused Deno/Edge Function checks for backend changes and real integration checks for changed external contracts.
- [ ] Build a Vercel Preview from the exact candidate commit. Test the preview's actual routes, network requests, storage, and critical flows before promotion.
- [ ] Promote only the exact reviewed candidate. Verify the production commit, deployment, aliases, custom domain, and post-release smoke test.
- [ ] Keep rollback steps for frontend, Edge Function, and database changes separate; a frontend rollback does not roll back backend state.

**Acceptance:** the merge commit, CI, preview, live smoke evidence, production deployment, and rollback target are traceable to one release record.

---

## P1 — Resources tab and student support

**Status note:** the owner reports that a Resources tab is currently being implemented. It is not present in the audited `main` revision, so the work is treated as in progress but has not been source-reviewed here.

### P1.1 Build a useful, maintained resource catalog

- [ ] Organize resources around student tasks: college preparation, FAFSA/TASFA and financial aid, state grants, essays and recommendations, career/major exploration, school and community support, and scholarship safety.
- [ ] Prefer official government, school, college, nonprofit, and program-owner resources. Label third-party directories clearly; do not imply that a directory verifies every listing it hosts.
- [ ] Keep resource records distinct from scholarship opportunities. A guide, calculator, aid portal, or counseling service is not a scholarship record.
- [ ] Define a small catalog contract: stable ID, title, plain-language summary, category, intended audience/grade range, geographic applicability, cost, publisher, source type, canonical HTTPS URL, language, last-reviewed date, review status, and optional next action.
- [ ] Add an editorial review lifecycle: candidate, reviewed, review due, unavailable, and retired. Record the source and review date; never silently present an expired link as current.
- [ ] Show what a resource helps with, who it is for, whether it is free, whether it is official, and where the student goes next.
- [ ] Add category browsing, keyword search, and filters for grade range and geography. Apply profile-derived filtering locally in the browser.
- [ ] Provide empty, loading, unavailable, and error states with useful next steps.
- [ ] Use the existing safe HTTPS URL validation approach. Open external links accessibly and safely; never accept arbitrary executable or non-HTTPS destinations.
- [ ] Test keyboard use, screen-reader names, focus visibility, reduced motion, contrast, text zoom, mobile layout, and long titles/descriptions.

### P1.2 Connect resources to the student's actual work

- [ ] Allow students to save/bookmark a resource and mark a resource as read or completed.
- [ ] Keep bookmarks and completion state in the local encrypted vault; do not upload browsing history or personal interests to a resource provider.
- [ ] Include user-owned resource state in encrypted backups with versioned migration and restore tests.
- [ ] Add contextual links from relevant areas of the app: essay guidance from Application Prep, financial-aid guidance from college planning, and scam guidance from scholarship review.
- [ ] Let a resource's next action open an existing Scout workflow where appropriate; do not create duplicate checklists or a second scholarship tracker.
- [ ] Make the Resources tab discoverable from primary navigation and support direct URLs, refresh, browser back/forward, active navigation state, and mobile navigation.
- [ ] Do not make a resource bookmark look like a scholarship saved to My Scholarships.

**Acceptance:** a student can discover, evaluate, save, revisit, and act on a resource; the resource is visibly distinguished from a scholarship; personal data remains local; backup and accessibility tests pass.

### P1.3 Establish resource quality operations

- [ ] Maintain a source-quality policy and a review cadence based on resource type and rate of change.
- [ ] Recheck high-impact application/aid instructions before each major application cycle.
- [ ] Run a periodic link and redirect check that flags failures for human review rather than automatically replacing URLs.
- [ ] Track last-reviewed dates and show stale status to students.
- [ ] Provide a lightweight process for reporting a broken, outdated, or misleading resource.
- [ ] Measure resource usefulness with optional, privacy-reviewed feedback; do not collect student profile information or publish unmoderated reviews.

---

## P1 — Scholarship discovery and matching quality

### P1.4 Measure search quality before changing the algorithm

- [ ] Human-review the existing 100-intent benchmark corpus and add graded relevance judgments for returned results.
- [ ] Expand the six-query golden set to cover state, local/county, school/district, major, grade level, enrollment stage, community service, employment, arts, and general opportunities.
- [ ] Define reviewer guidance for relevant, strong, weak, and irrelevant results. Record disagreements and adjudicate ambiguous cases.
- [ ] Curate official-source anchors and claim support independently from search output. A retrieved URL is not proof that it supports a claim.
- [ ] Report nDCG@10, precision@10, MRR@10, recall@50, supporting-source recall, citation accuracy, freshness compliance, duplicate rate, latency, and judged coverage.
- [ ] Segment results by intent/category and geography; do not let a strong aggregate conceal a weak category.
- [ ] Preserve N/A for unjudged metrics. Do not call an empty denominator a pass.
- [ ] Establish a reproducible baseline against the deployed provider and compare every ranking change on the same corpus.

**Acceptance:** benchmark judgments are complete enough for each claimed improvement; all metrics include denominators and per-query/category breakdowns; no ranking change is accepted based only on result count or anecdotal examples.

### P1.5 Improve retrieval and result usefulness

- [ ] Review missed relevant results and false positives by intent before changing query expansion.
- [ ] Improve query generation for synonyms, alternate program names, grade/year phrasing, local sponsor terms, college names, and major-specific associations.
- [ ] Improve institutional/source discovery without treating a domain suffix alone as proof of legitimacy.
- [ ] Review result deduplication and provenance merging so useful distinct awards on one program page are not collapsed.
- [ ] Explain why a result appeared and which parts of the student's profile were evaluated locally.
- [ ] Keep eligibility assessment separate from ranking. Never hide a result solely because the student's profile is incomplete.
- [ ] Display retrieval date separately from sponsor review date and source publication/update date.
- [ ] Preserve bounded timeouts, concurrency, retries, request limits, and partial-result summaries.
- [ ] Evaluate a curated scholarship source/program index as a complementary recall source. Define ownership, provenance, cycle dates, stale handling, and editorial controls before populating it.
- [ ] Compare another provider only after a live, authorized, like-for-like evaluation of recall, relevance, freshness, duplicate rate, reliability, privacy, and total operating cost.

### P1.6 Improve scholarship review and eligibility explanations

- [ ] Make the source-review workflow guided and consistent: sponsor identity, official URL, award details, current cycle, deadline wording/time zone, supporting evidence, individual criteria evidence, and review date.
- [ ] Show the exact evidence supporting each structured eligibility requirement.
- [ ] Explain unknown requirements and the next information needed to resolve them.
- [ ] Preserve mandatory, preferred, and optional distinctions through editing, local save, cloud mapping, and backup restore.
- [ ] Add clear warnings when requirements are unsupported or ambiguous; do not overstate the rules engine's coverage.
- [ ] Show expired, not-yet-open, deadline-unconfirmed, and review-overdue states distinctly.
- [ ] Maintain review history when sponsor evidence changes and invalidate verification when relevant source fields change.
- [ ] Keep automated sponsor-page extraction or change detection behind a disabled-by-default, separately reviewed workflow with human approval before any record is verified.

**Acceptance:** every displayed status has an explainable basis; no missing information becomes a false failure; source evidence is attributable to an official sponsor page; current-cycle and deadline uncertainty remain visible.

---

## P1 — Unified student planning and application follow-through

### P1.7 Build a student action center

- [ ] Bring together upcoming deadlines, incomplete application steps, outstanding recommendations, required documents, saved resources, and scholarships needing source review.
- [ ] Show a short, prioritized "Next steps" list with a clear reason for each task and a direct route to complete it.
- [ ] Separate sponsor deadlines from personal target dates and distinguish priority deadlines from final deadlines.
- [ ] Let students dismiss, snooze, reorder, or complete suggested actions without changing sponsor facts.
- [ ] Avoid overwhelming the dashboard with repeated counts or large generic progress scores.
- [ ] Keep action-center state local and include it in the backup contract.

### P1.8 Add student-controlled reminders and calendar export

- [ ] Add opt-in reminders for sponsor deadlines, personal target dates, document due dates, and recommendation follow-ups.
- [ ] Make reminder timing and delivery channel explicit; do not request notification permission before the user chooses to enable reminders.
- [ ] Start with local reminders and a standard calendar-file export where feasible; evaluate server-delivered reminders only after a privacy and reliability review.
- [ ] Respect date-only deadlines. Do not invent a cutoff time or timezone when the sponsor has not stated one.
- [ ] Prevent duplicate reminders and make cancellation, rescheduling, and timezone behavior testable.
- [ ] Make missed, expired, and unconfirmed deadlines visibly different.

### P1.9 Improve application preparation

- [ ] Improve reusable task templates for essays, transcripts, résumés, recommendation letters, portfolios, and final review without assuming every document is required.
- [ ] Add optional student-controlled reusable draft snippets or application notes only if storage and backup remain private and clear.
- [ ] Provide better progress summaries across multiple tracked applications.
- [ ] Provide clear status history for preparation, readiness, submission, and decision without conflating these states with eligibility.
- [ ] Add export/print views for an individual application plan, with a clear preview of what will be included.
- [ ] Keep actual application submission, sponsor communication, and sharing of documents entirely student-controlled.

**Acceptance:** the student can see the next task, understand why it matters, complete it, and recover the progress locally without Scout performing external actions on their behalf.

---

## P2 — Performance, architecture, and operational resilience

### P2.1 Modularize the active workspace incrementally

- [ ] Establish a current runtime module map and identify which existing feature modules are wired into the actual entry point.
- [ ] Move one cohesive route or domain at a time out of the large application component; do not perform a risky all-at-once rewrite.
- [ ] Wire route modules only after their model contracts, storage dependencies, navigation behavior, and tests are clear.
- [ ] Separate resource catalog/bookmark logic, scholarship discovery, eligibility, tracker, application preparation, and settings into bounded modules.
- [ ] Keep business rules in tested domain modules instead of duplicating calculations in page components.
- [ ] Remove or archive obsolete modules only after proving they are unused by production, tests, and build tooling.
- [ ] Keep direct navigation, deep links, history, keyboard navigation, and mobile navigation consistent during each refactor.

### P2.2 Optimize from measured bottlenecks

- [ ] Capture baseline bundle sizes, route-load costs, memory, mobile interaction responsiveness, local-vault read/write cost, and search latency on the current revision.
- [ ] Use real profiling to identify the slow route, component, query, rendering path, or storage operation before optimizing it.
- [ ] Apply route-level code splitting where it reduces work on the initial path without breaking the legal-acceptance gate or direct routes.
- [ ] Reduce repeated full-list work in tracker and search views when profiling shows it matters.
- [ ] Review large data structures, repeated normalization, expensive filtering, and unnecessary re-renders with representative synthetic records.
- [ ] Review image/font delivery and CSS payload only where they materially affect loading or rendering.
- [ ] Inspect actual Supabase query plans, cardinality, and usage before adding or removing indexes.
- [ ] Keep network retries, caches, and concurrency bounded; test cancellation and stale-response handling.
- [ ] Re-run the same measurements after each optimization and reject changes that do not provide a measurable benefit.

**Acceptance:** each optimization has a before/after measurement, a regression test or reproducible benchmark, and no correctness, privacy, accessibility, or data-integrity regression.

### P2.3 Improve resilience and operations

- [ ] Define service-level indicators for discovery availability, latency, error categories, and partial-result rate without collecting student profile payloads.
- [ ] Decide where operational monitoring belongs. Existing browser diagnostics are local-only; do not add telemetry that captures URLs, profile values, essay text, or identifiers.
- [ ] Document gateway recovery, token rotation, process restarts, quotas, backup, and incident response.
- [ ] Before adding gateway replicas or materially increasing traffic, introduce and test a central rate/concurrency coordinator. The current Edge isolate and single gateway process limits are not a distributed quota system.
- [ ] Add bounded health checks and alerting for the gateway and deployed Edge Function without exposing secrets.
- [ ] Define cache invalidation, freshness, and outage behavior for any future catalog.
- [ ] Make operational status visible to maintainers without exposing infrastructure details to students.

### P2.4 Improve dependency and data lifecycle management

- [ ] Review Dependabot updates in focused groups; test framework major upgrades independently.
- [ ] Keep Node runtime, package engine, CI runtime, lockfile, and documentation aligned.
- [ ] Review Supabase schema and RLS changes independently from frontend features.
- [ ] Reconcile and document migrations before any DDL; never use the legacy schema file.
- [ ] Test backup version upgrades and old-backup compatibility whenever a new local data type is introduced.
- [ ] Define a safe data export and deletion inventory across local vault, backups, Supabase cloud records, and browser session state.

---

## P3 — Longer-term product opportunities

These are strategic options, not commitments. Start only after the P0 release gates and P1 student workflows are dependable.

### P3.1 Curated scholarship and student-support knowledge base

- [ ] Build a maintained catalog of official scholarship programs, university awards, state aid programs, and trustworthy student resources.
- [ ] Model annual application cycles separately from permanent sponsor/program identity.
- [ ] Preserve historical cycle records, official source snapshots or excerpts where permitted, dates checked, and change history.
- [ ] Track eligibility requirements with structured operators and criterion-level evidence, retaining unknown states for ambiguous rules.
- [ ] Establish editorial ownership and review operations before increasing catalog size.
- [ ] Expose API contracts only after source licensing, update rights, security, and user-data boundaries have been reviewed.

### P3.2 Deeper college, career, and financial-aid planning

- [ ] Add optional college and major research workflows that connect to scholarships and official institutional resources.
- [ ] Consider a neutral college-cost and aid-offer comparison worksheet using user-entered figures and clearly identified official inputs.
- [ ] Distinguish grants, scholarships, loans, work-study, and out-of-pocket cost; never present estimates as guaranteed aid.
- [ ] Add career and professional-association resource paths that can suggest relevant scholarship research without making eligibility assumptions.
- [ ] Keep financial information local unless a separate explicit cloud-storage decision is approved.

### P3.3 Optional cross-device continuity

- [ ] First document the real student need and limitations of device-local storage.
- [ ] Design explicit opt-in, client-side encryption, key recovery, device enrollment, conflict resolution, deletion, and backup semantics.
- [ ] Decide whether each data class is eligible for sync; essays and sensitive notes should not be silently included.
- [ ] Threat-model compromised devices, lost keys, account takeover, stale sessions, and shared devices.
- [ ] Prototype with synthetic data and independent security review before enabling any real student sync.
- [ ] Keep local-only mode fully supported.

### P3.4 Sponsor change detection with human review

- [ ] Evaluate official-page change detection for deadline, award, cycle, or eligibility changes.
- [ ] Store retrieval time separately from sponsor-confirmed review time.
- [ ] Present a diff and original source link for human approval.
- [ ] Never silently update a student's saved scholarship or change its verified state.
- [ ] Measure false alarms, missed changes, source stability, and operating cost before expanding coverage.

### P3.5 Privacy-preserving product learning

- [ ] Gather optional, minimal feedback about whether results and resources were useful.
- [ ] Prefer synthetic benchmarks and aggregate counts; do not collect student profile, essay, contact, school, or application data for analytics.
- [ ] Make feedback optional, explain what is sent, and allow withdrawal.
- [ ] Use measured student pain points to choose future features instead of adding features based on raw engagement.

---

## Standard bug-fix workflow

Every bug should follow this process. Emergency security/privacy incidents can use the incident path, but still require an auditable fix and regression coverage.

1. **Intake and scope.** Record the affected workflow, app version/commit, browser/device, expected behavior, actual behavior, frequency, and safe reproduction steps. Remove personal information, tokens, student records, and essay content from reports.
2. **Classify severity.**
   - **P0 critical:** unauthorized access, privacy exposure, credential/secret leakage, data corruption/loss, broken restore, cross-account access, or a broadly unsafe eligibility/deadline calculation.
   - **P1 major:** a core workflow is unusable or materially incorrect, such as discovery, source review, saving, authentication, or application preparation, with no acceptable workaround.
   - **P2 normal:** a significant defect has a viable workaround or affects a limited workflow or device.
   - **P3 minor:** cosmetic, copy, or low-impact behavior with no material correctness or accessibility effect.
3. **Reproduce safely.** Confirm the defect on the affected revision using synthetic fixtures. Identify whether the cause is frontend, domain logic, storage, backend, provider, configuration, or an external service.
4. **Add a failing regression test.** Capture the bug before changing behavior. Prefer a minimal deterministic test that fails for the original defect and passes only when the correction is effective.
5. **Fix the smallest responsible layer.** Avoid broad rewrites, unrelated cleanup, weakening validation, relaxing RLS, changing privacy payloads, or suppressing errors to make a test pass.
6. **Verify adjacent behavior.** Run the focused test, relevant integration tests, full project tests, build, and dependency audit. For Edge Function changes, run Deno/Edge checks and bounded synthetic integration tests. Record skipped tests and explain them.
7. **Review UX and privacy.** Verify error recovery, accessible messages, keyboard behavior, mobile layout, storage rollback, request payloads, authorization, and logs as relevant.
8. **Preview and review.** Put the fix on a focused branch, request independent review, and test a Vercel Preview from the exact candidate commit.
9. **Release and observe.** Merge through the protected workflow, deploy the approved commit, run a production smoke test, and monitor the affected indicator. Keep a rollback path.
10. **Close the loop.** Record the root cause, affected versions, regression test, deployment evidence, and any follow-up prevention work.

Do not close a defect because it cannot be reproduced once. Record intermittent failures and gather privacy-safe evidence.

## Standard optimization workflow

1. Define the user-visible outcome to improve: search relevance, first meaningful render, interaction responsiveness, local-save reliability, route load, or operational cost.
2. Record a reproducible baseline on a named commit and representative synthetic data. Include device class, browser, network conditions, sample size, and measurement method.
3. Profile the actual bottleneck. Distinguish CPU, rendering, bundle transfer, storage, network, provider latency, and backend queueing.
4. State a hypothesis and expected measurable benefit before changing code.
5. Make one bounded change at the correct layer. Avoid speculative memoization, unnecessary dependencies, premature caching, unbounded parallelism, or broad infrastructure changes.
6. Add or update a benchmark/regression test. Preserve request limits, cancellation, stale-response protection, safe URL handling, and user-data boundaries.
7. Compare before and after under the same conditions. Record median and tail latency where appropriate, plus errors, memory, bundle size, and correctness.
8. Keep the optimization only when it produces a meaningful benefit without degrading correctness, privacy, accessibility, or reliability.
9. Re-run the full release gate and verify the actual preview, not just a local microbenchmark.

## Release acceptance checklist

A feature or fix is not complete until the applicable items are satisfied:

- [ ] Requirements and acceptance criteria are explicit.
- [ ] No known P0/P1 defect is left unexplained in the affected workflow.
- [ ] Focused regression tests cover the behavior.
- [ ] Full `npm test`, `npm run build`, and `npm audit --audit-level=moderate` pass for frontend code.
- [ ] Edge Function/Deno tests and integration checks pass for backend changes.
- [ ] No unexplained skipped tests or missing test evidence.
- [ ] Local storage, encrypted backup/restore, RLS, and cloud mapping remain correct where affected.
- [ ] Accessibility and responsive behavior are verified where the UI changed.
- [ ] Vercel Preview uses the exact candidate commit and critical browser workflows pass.
- [ ] Data migration, rollback, feature flags, and production owner actions are documented where applicable.
- [ ] Production behavior is verified separately from source/preview behavior.

## Roadmap maintenance

- Review priorities after each meaningful release and when new audit findings appear.
- Every roadmap task should have an owner, status, priority, dependency, acceptance criteria, and a link to its issue or pull request when one exists.
- Split tasks that touch unrelated layers into focused pull requests.
- Re-estimate priorities using student impact, evidence/confidence, reach, privacy/safety risk, engineering cost, and operational burden.
- Do not assign calendar promises without capacity and dependencies being known.
- Move completed items to a dated release record with test and deployment evidence; keep this roadmap focused on open work.
- Keep `docs/improvement-plan.md` as historical context until its overlapping statuses are reconciled; do not let it act as a competing source of current priorities.
