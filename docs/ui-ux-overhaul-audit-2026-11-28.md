# UI/UX audit and modularization assessment — November 28, 2026

**Repository:** `randynlinda4ever-dot/scholarship-scout`  
**Canonical baseline:** `main` at `d757597eaf9b5153c6b45479146f09caae345ad9`  
**Implementation candidate:** [PR #31](https://github.com/randynlinda4ever-dot/scholarship-scout/pull/31)  
**Audit mode:** source, tests, and repository configuration review. No production deployment or production configuration was changed.

## Executive assessment

Scholarship Scout already has a broad student workflow: scholarship discovery, eligibility review, saved scholarship tracking, application preparation, essay and recommendation organization, deadlines, financial-aid worksheets, and a local encrypted vault. The product does not need a second tracker, essay generator, recommendation tool, or deadline calendar.

The main architectural weakness is that the active application remains concentrated in a large composition component and stylesheet. A page-module architecture exists in preserved work, but the current runtime is not yet fully using it. Some preserved page modules are stale relative to the live Settings and other workflows, so wiring them in wholesale would risk removing current security and account controls.

PR #31 adds one genuine gap without duplicating existing tools: a structured student activities and resume workspace inside the existing Resources section. Its data uses the current encrypted local resource workspace and backup mechanism.

This is a source-based audit, not a claim that every visual and assistive-technology behavior has been verified in a live browser.

## Scope and method

Inspected the current GitHub source, current branch/commit metadata, route and navigation definitions, feature components, resource persistence and backup code, CSS, repository tests, workflow configuration, architecture notes, deployment notes, and privacy/security documentation.

Reviewed relevant test coverage for workspace modularization, navigation, mobile layouts, dialogs, cloud-search announcements, notification accessibility, resource persistence, and responsive regressions. GitHub Actions ran the repository's full test/build workflow for PR #31.

Not performed in this environment:
- Live manual browser walkthroughs or viewport screenshots.
- Physical-device testing.
- VoiceOver, NVDA, or other spoken screen-reader testing.
- A formal WCAG conformance audit with a browser accessibility tree and assistive technology.
- Student interviews or a statistically representative user survey.

The findings below distinguish source observations from recommendations and unverified behavior.

## Current page and workflow inventory

| Area | Active capabilities observed |
|---|---|
| Public homepage | Product explanation and entry into scholarship discovery/workspace |
| Public scholarship guides | Crawlable scholarship education pages, including high-school-junior, Texas, GPA, and major guides |
| Home / Overview | Profile-readiness summary, scholarship pipeline counts, deadline visibility, encrypted backup entry points, navigation to search and tracker |
| Find scholarships | Generic search links and trusted source links, plus separate live discovery |
| Live discovery | Category selection and limited request fields; public discovery does not receive the full student profile |
| My scholarships | Add/edit/archive, search, filter, sort, eligibility/source review, application status, duplicate suggestions, and CSV export |
| Application preparation | Core/custom checklists, essay prompts and drafts, recommendation requests, required documents/deadlines, final review, submission/decision record |
| My profile | Explicit profile fields used by search/eligibility rules and readiness feedback |
| Resources | Existing tracker link, essay planning, financial-aid checklist and college-cost comparison, scholarship scam guide, junior-to-senior calendar; PR #31 adds activities/resume builder |
| Settings | Appearance, local encrypted vault, remembered-device controls, local diagnostics, cloud connection, backup/restore, privacy/account controls |

The six top-level navigation destinations are Home, Find scholarships, My scholarships, My profile, Resources, and Settings. Cloud Search is grouped under Find scholarships; Application preparation is grouped under My scholarships. This grouping avoids exposing every nested workflow as a top-level destination.

## Design and implementation observations

### Active application concentration

At the audited baseline:
- `src/App.tsx`: 2,327 lines and 187,404 bytes.
- The active application contains 65 state-hook tuple declarations.
- `src/App.css`: 1,402 lines and 84,612 bytes.
- The main stylesheet contains 26 `!important` declarations and 25 media-query blocks.

These are static source measurements, not performance benchmarks. They indicate that the application shell and styling cascade deserve incremental modularization, not an uncontrolled rewrite.

### Preserved modules are not a drop-in replacement

The repository's `docs/frontend-module-architecture.md` explicitly describes the full page-module split as preserved refactor work rather than a fully active runtime integration. The live application still renders several substantial page branches from `App.tsx`.

The preserved Settings page is not equivalent to the active Settings workflow: the live application includes encrypted-vault and remembered-device behavior, local diagnostics, account/privacy controls, and cloud/backup interactions. Replacing the live branch with the preserved component without first reconciling its prop model and acceptance criteria could remove critical behavior.

**Recommendation:** treat the active `App.tsx` as the behavior source of truth. Reconcile one page module at a time against live behavior and tests. Do not connect stale components simply to reduce the line count.

### Existing visual and interaction patterns to preserve

The active app already has a coherent named visual system, dark/light theme state, compact-view preference, collapsible desktop sidebar, grouped navigation, nested workspace navigation, consistent forms/cards, and a responsive tracker representation.

Existing accessibility-oriented behavior and tests include:
- A skip link and named main landmark.
- Visible focus styling and reduced-motion rules.
- Semantic buttons and labeled form controls.
- Dialog focus initialization, Tab containment, Escape handling, and focus restoration.
- Status and error announcements for selected async workflows.
- Grouped mobile navigation and small-screen tracker presentation.
- Tests for navigation state, dialog behavior, cloud-search feedback, notification accessibility, contrast tokens, and responsive regressions.

These are important existing capabilities; future simplification must preserve them.

## Ranked findings

### P1 — Complete the page-module migration safely

The component concentration makes regressions harder to isolate and makes visual changes unnecessarily expensive. The preserved page modules offer a useful starting point, but some are not current.

Recommended sequence:
1. Compare each preserved page module with the live branch it would replace.
2. Restore missing controls, data, handlers, and security behavior before switching the route.
3. Move one route at a time, keeping `App.tsx` as the composition root for shared state and persistence.
4. Add route-specific integration tests before removing the corresponding inline branch.
5. Keep feature logic in existing `src/lib/` domain modules rather than creating new generic frameworks.

### P1 — Reduce stylesheet cascade complexity

The main stylesheet is large and contains 26 `!important` declarations. This increases the cost of responsive and theme changes.

Recommended approach:
1. Identify actual selector ownership and duplicated rules.
2. Preserve existing theme token behavior and import order.
3. Extract a focused layer only when its selectors have clear ownership.
4. Remove an override only after checking desktop, mobile, light/dark, focus, and print behavior.
5. Avoid replacing the current CSS with a new styling dependency.

### P2 — Keep navigation simple while improving cross-workflow continuity

The six-destination navigation and two nested workspace views are a reasonable information architecture. The improvement opportunity is not to add more navigation items; it is to make the current route/state relationship and cross-feature transitions easier to maintain and test.

Use one canonical destination contract and ensure browser Back/Forward, direct links, and refresh behavior remain consistent for resource and workspace subviews.

### P2 — Improve the dashboard's next-action hierarchy

The Overview already shows profile readiness and the scholarship pipeline. A focused follow-up could prioritize the next user-controlled action across existing tracker and application-prep data. It must reuse existing records and must not create a competing task store or a new notification service.

### P2 — Validate the full accessibility and responsive experience in a browser

The source and tests provide useful safeguards but do not establish full WCAG 2.2 AA conformance. A later browser verification pass should cover keyboard-only operation, focus order, text zoom, contrast in both themes, long user-entered content, mobile orientation, print preview, dialog recovery, and screen-reader announcements.

## Responsive and accessibility test inventory

Relevant existing tests include:
- `tests/mobileResponsive.test.mjs`
- `tests/responsiveRedesignFixes.test.mjs`
- `tests/responsiveWorkspaceRegression.test.mjs`
- `tests/legalAcceptanceResponsive.test.mjs`
- `tests/dialogAccessibility.test.mjs`
- `tests/cloudSearchAccessibility.test.mjs`
- `tests/searchResultsNavigationAccessibility.test.mjs`
- `tests/notificationAccessibility.test.mjs`
- `tests/navigationInformationArchitecture.test.mjs`
- `tests/phase5Usability.test.mjs`
- `tests/uiAuditFixes.test.mjs`

The active app source contains 61 buttons, 7 forms, 34 labels, 14 inputs, 15 selects, 10 textareas, 30 `aria-label` attributes, 13 `aria-live` attributes, 4 `role="dialog"` declarations, and 1 `aria-current` declaration. These are inventory counts only; they do not measure accessible names, correct state transitions, contrast in rendered themes, or screen-reader quality.

## Privacy and technical boundaries

The current architecture documents an encrypted browser-local vault for student profile and private application material. Scholarship discovery remains constrained to the public search contract. PR #31 changes only resource workspace data and UI; it does not change discovery payloads, Supabase schema or RLS, account authentication, deletion, analytics, advertising, or deployment configuration.

The new resume information is stored with the existing encrypted Resource workspace. It is not added to the student's scholarship eligibility profile, discovery request, analytics, ad requests, or an external service. The share control carries only the resource link; resume content is not placed in the URL.

## Verification performed

For the first implementation commit in PR #31:
- Dependency review: passed.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- `npm test`: 885 passed, 0 failed, 0 skipped.
- `npm run build`: TypeScript check and Vite production build passed.

The branch also received a successful Vercel status check. That status is not evidence of a production release or a manual browser/viewport review.

## Remaining work

The complete UI/UX overhaul is not finished by this PR. Still outstanding are the route-by-route module migration, systematic stylesheet simplification, browser visual inspection, manual keyboard/screen-reader testing, full viewport coverage, and measured frontend performance baselines. Do not describe the complete overhaul as done until those items have been verified.

The next implementation should continue on an isolated branch/PR, preserve all other agents' work, and use the priorities in [the student tools roadmap](student-tools-roadmap-2026-11-28.md).
