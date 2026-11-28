# Test and verification strategy

> **Verification status — November 27, 2026:** The corrected wrapper and regression tests were validated at historical implementation snapshot revision `df84889396d5d5176051b9cd1f4595c2686b0167`; the current documentation revision is `fd7c990bcc5a4a493fd20ab23c871e5d5e452b12`. On the matching GitHub release checkout, `npm ci` passed; `npm test` passed **730/730 with zero failures and zero skipped**; `npm run build` completed TypeScript checking and Vite production bundling; `npm audit --audit-level=moderate` found zero vulnerabilities; and `git diff --check` passed. The tested wrapper uses the per-isolate IP limiter plus the authenticated gateway's process-wide 30-request-per-minute ceiling; Upstash is not required. After test names were clarified, the focused edge/security suite passed 17/17. Supabase remains deployed at version 19 pending reviewed source deployment and a fresh function-to-gateway smoke test. See [the source reconciliation record](source-reconciliation-2026-11-27.md), [rate-limit decision](rate-limit-decision-2026-11-27.md), and [runtime audit](runtime-audit-2026-11-27.md).

## Commands

- `npm ci` installs exact lockfile dependencies.
- `npm test` runs `tests/*.test.mjs` with Node's built-in test runner.
- `npm run build` runs TypeScript no-emit checking followed by the Vite production build.
- `npm audit --audit-level=moderate` checks dependencies against the configured threshold.

## Coverage

The project contains unit tests for profile validation, discovery and URL safety, result normalization, evidence status, eligibility, duplicate recommendations, tracker filtering, application workspace helpers, CSV generation, encrypted backups, batch browser-storage writes, local reliability monitoring, same-frame email callback generation, public live-search request boundaries, and signed-out result rendering.

## Authentication and public-search regression tests

- `tests/authRedirect.test.mjs` checks callback origin handling, path preservation, and HTTPS enforcement.
- `tests/authSignInExperience.test.mjs` and `tests/cloudConnectionConfig.test.mjs` ensure email sign-in uses the current embedded app origin.
- `tests/googleOAuth.test.mjs` covers Google OAuth setup, anonymous identity linking, limited scopes, PKCE callback detection/restoration, and the updated privacy disclosure.
- `tests/liveDiscoveryNoLogin.test.mjs` verifies the live-search client does not create or require a Supabase user, the UI shows public results while signed out, and the Edge Function is configured for public requests with bounded inputs.
- `tests/liveDiscoveryCapabilities.test.mjs` tracks the deployed version-19 category allow-list.
- Cloud database reads and writes remain authenticated and use the existing owner-scoped RLS policies.

## Other regression coverage

- Eligibility: missing profile fields, incomplete ACT/SAT alternatives, ambiguous immigration categories, numeric high-school grade entries, independent applicant-residence/current-school/intended-college state comparisons (`tests/eligibilityLocationEvidence.test.mjs`), and inclusive/exclusive age boundaries with unknown handling (`tests/eligibility.test.mjs`).
- Profile validation and cloud mapping: whole-year age input bounds and persistence of sponsor age-range criteria; applicant age remains local (`tests/profileValidation.test.mjs`, `tests/cloudMapping.test.mjs`).
- Deadlines: separate priority and final milestones, cloud metadata round-trip, legacy final-deadline compatibility, no inferred priority dates, source-review invalidation when a milestone changes, local calendar-day boundaries, next-day expiry, rolling/recurring wording that remains date-free, and annual prior-cycle dates that never roll forward (`tests/deadlineMilestones.test.mjs`, `tests/eligibilityDateOnlyDeadline.test.mjs`, `tests/rollingDeadline.test.mjs`, `tests/recurringAnnualDeadline.test.mjs`).
- Browser storage: batch persistence, failed-write rollback, blocked snapshots, and serialization failures.
- Duplicate recommendations: exact, strong, and possible classifications with sponsor/year guardrails and no destructive merge.
- Discovery: bounded pagination, minimal state/year/category request payload, and unverified-lead state.
- Source-label isolation: live-result normalization discards search-result authority/label metadata, keeps each result's own category provenance, filters unknown category labels, and never inherits authority from adjacent or deduplicated records.
- Public-source hygiene: generic test and placeholder fixtures do not ship personalized school or academic defaults.
- Source evidence history: sponsor URL, supporting URL, and source/criterion excerpt edits retain the previous revision locally; unrelated tracker edits do not create history entries, and cloud mapping excludes the local history.
- Evidence attribution: general, award, and criterion excerpts each require their own exact official page URL; verification and cloud reload checks reject missing or cross-domain source attribution.
- Government source authority: only explicitly allowlisted government domain roots and their subdomains receive the official-government label; unlisted .gov domains and lookalike suffixes remain unverified, including after cloud mapping.
- Source date semantics: sponsor-check dates come only from explicit review metadata; discovery dates are not inferred from cloud row creation or update timestamps; record creation is shown separately, and missing dates remain unknown.
- Mandatory/preferred criteria: preferred failures and unknowns remain visible but do not change eligibility status; mandatory failures and unknowns continue to block; preferred-only records cannot establish eligibility; importance metadata survives cloud save/reload.

## Historical full verification (not run against current HEAD)

On the refreshed Windows validation workspace using Node.js 26.13.0:

- `npm test`: **217 passed, 0 failed**.
- `npm run build`: TypeScript and Vite passed; 82 modules transformed.
- `npm audit --audit-level=moderate`: **0 vulnerabilities**.

## SC-050 — rolling review windows

- Existing deadline normalization does not parse calendar dates from sponsor wording. Explicit rolling/recurring descriptions can satisfy non-date deadline evidence, while an empty structured deadline remains empty; tracker urgency returns Unknown without a valid date. Explicit sponsor IANA zones are applied only to an actual recorded date.
- Added four synthetic regression cases in `tests/rollingDeadline.test.mjs` for rolling wording across fixed UTC-midnight instants, rolling review until funds are committed, recurring annual wording without a guessed next cycle, and the exact sponsor-local midnight boundary for an explicitly recorded date.
- Focused command `node --test tests/rollingDeadline.test.mjs`: NOT RUN. Full command `npm test`: NOT RUN. historical implementation snapshot provides source inspection and commits but no Node/npm execution; Desktop Commander is restricted to local Apex runtime work and cannot run product tests.
- Browser smoke is deployment-only and cannot verify this historical implementation snapshot source revision.

## SC-051 — recurring annual deadlines

- Existing normalization preserves a structured deadline exactly as recorded. A valid date earlier than the sponsor-local current date is marked expired; no annual wording parser advances its year. With no current-cycle date, tracker urgency remains Unknown. An invalid explicitly recorded IANA zone produces Needs review/Unknown rather than an inferred zone.
- Added four fixed-instant synthetic regressions in `tests/recurringAnnualDeadline.test.mjs`: a prior-year September date in the next annual cycle, the December 31 to January 1 sponsor-local midnight boundary, annual wording with no current-cycle date, and invalid timezone handling.
- Focused command `node --test tests/recurringAnnualDeadline.test.mjs`: NOT RUN. Full command `npm test`: NOT RUN. historical implementation snapshot provides source inspection and commits but no Node/npm execution; Desktop Commander is restricted to local Apex runtime work and cannot run product tests.
- Browser smoke is deployment-only and cannot verify this historical implementation snapshot source revision.

## SC-053 — date ranges and application opening dates

- Added a separate sponsor-confirmed `openDate` and optional `openDateTimezone`; neither is inferred from deadline wording. A future opening date displays “Opens in …” instead of overdue, suppresses expiry for a stale prior-cycle deadline, and keeps eligibility at Needs information until the opening date arrives. An invalid date/time zone or a final deadline earlier than the opening date remains Unknown / Needs review.
- Opening date is included in local source-review invalidation/history and existing cloud JSON metadata; no database schema change was made. The editor and scholarship detail view expose the date and only-stated timezone.
- Eight synthetic fixed-instant regression tests cover future openings with a stale deadline, sponsor-local midnight, invalid dates/time zones, inconsistent date ranges, opening-only records, source-evidence history and invalidation, and cloud metadata round-trip (`tests/openingDate.test.mjs`).
- Focused command `node --test tests/openingDate.test.mjs`: NOT RUN. Full command `npm test`: NOT RUN. Build command `npm run build`: NOT RUN. the test runner was not available for this dated historical work item; current repository test/build/audit evidence is recorded in the top-level README.
- Browser smoke is deployment-only and cannot verify this historical implementation snapshot source revision.

## Live integration status — November 27, 2026

Supabase reports `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false`. The corrected historical implementation snapshot/GitHub wrapper keeps the two-per-minute per-IP isolate limiter and relies on the authenticated gateway's process-wide 30-request-per-minute ceiling; Upstash credentials are not required. The deployed v19 source still needs a reviewed update to match the corrected wrapper and its CORS header. The v19 files and rollback metadata have been preserved. A direct authenticated laptop request to the named gateway returned HTTP 200 with 15 results, but it did not invoke Supabase.

The source includes email magic-link sign-in and Google OAuth support, but a successful live Google callback and all relevant provider settings must be verified independently. Browser acceptance of the legal notice is versioned; the age gate accepts adults, requires a separate parent/legal-guardian authorization selection for users aged 13–17, and blocks under-13 use. The gate does not verify age or guardian identity.

The latest corrected wrapper/test changes passed `npm ci`, `npm test` (730 passed, zero failed, zero skipped), `npm run build`, `npm audit --audit-level=moderate` (zero vulnerabilities), and `git diff --check` on the corresponding GitHub release checkout. A read-only headless browser pass rendered the preview legal notice with no console errors, but did not accept the notice, sign in, or submit profile data. Real-browser validation of local-vault persistence, full consent/age flow, discovery through Supabase, cloud ownership, sign-in, and account deletion remains outstanding. The limiter choice is resolved; Supabase source parity and a fresh function-to-gateway POST remain deployment gates.

## SC-039 — enrollment-status alternatives (November 24, 2026)

- Added eight synthetic regression cases covering full-time, part-time, incoming-college, current-student, unresolved alternatives, explicit rejection of all alternatives, legacy full-time-only behavior, and cloud criteria round-trip persistence.
- Product test commands `node --test tests/enrollmentAlternatives.test.mjs` and `npm test`: **NOT RUN**. historical implementation snapshot artifact tools provide source inspection, history, and commits but no shell or product test runner. Desktop Commander is restricted to Apex runtime work and cannot be used for product tests.
- Real-browser verification: **NOT RUN**; no authorized product browser/test environment is available in this chat. No deployment or publication was performed.

## SC-038 — age-range boundaries (November 24, 2026)

- Added synthetic checks for inclusive and exclusive minimum and maximum boundaries, missing applicant age, unspecified boundary inclusivity, and contradictory ranges.
- Added profile validation coverage for whole-year ages from 0 through 120, cloud mapping coverage for sponsor age-range criteria, and a public-search payload regression proving applicant age remains local.
- Focused command `node --test tests/eligibility.test.mjs tests/profileValidation.test.mjs tests/cloudMapping.test.mjs tests/discovery.test.mjs`: **NOT RUN**. historical implementation snapshot artifact tools provide source inspection, history, and commits but no shell or product test runner. Desktop Commander is restricted to Apex runtime work and cannot be used for product tests.
- Full command `npm test`: **NOT RUN** for the same capability limitation. No Apex runtime test is being substituted for product verification.
- Real-browser verification: **NOT RUN**; no authorized product browser/test environment is available in this chat. No deployment or publication was performed.

## SC-019 — conservative numeric eligibility thresholds (November 25, 2026)

- Added synthetic regression cases proving malformed GPA thresholds, out-of-range ACT thresholds, and invalid remaining ACT/SAT alternatives stay **Unknown** rather than becoming false failures.
- Numeric sponsor thresholds are range-checked before comparison: GPA 0–5, class-rank cutoff 0–100%, ACT 1–36, and SAT 400–1600. An ACT-or-SAT alternative can still pass through a valid qualifying route; an invalid unresolved route cannot be treated as a failure.
- Focused command `node --test tests/eligibility.test.mjs`: **NOT RUN**. These checks were not run during the dated historical work item. The current repository test/build/audit evidence is recorded in the top-level README.
- Full command `npm test`: **NOT RUN** for the same reason. `npm run build`: **NOT RUN**; no authorized product build runner is available.
- Hatchable browser smoke is deployment-only and cannot verify this un-deployed artifact revision. No deployment or publication was performed.

## SC-054 — invalid calendar dates

- Date-only validation was already strict in evidence, eligibility, cloud-identity, and tracker urgency calculations: impossible month/day combinations do not round forward into valid dates. The gap was that an impossible non-empty structured deadline could still be accepted as a date-free rolling/unpublished deadline when sponsor wording or the `deadlineNotPublished` flag supplied fallback evidence.
- `deriveSourceStatus` now forces a malformed explicit date to **Needs review** before considering date-free fallback wording. Evidence completeness likewise refuses to count rolling/unpublished wording as complete while an impossible structured date remains present. The malformed value is preserved rather than silently rewritten.
- Added synthetic coverage in `tests/evidence.test.mjs` for impossible dates conflicting with rolling and unpublished sponsor wording, plus a valid date-free rolling control. Added fixed-instant leap-day and month-end cases in `tests/trackerInsights.test.mjs` using explicit sponsor time zones.
- Focused commands `node --test tests/evidence.test.mjs` and `node --test tests/trackerInsights.test.mjs`: **NOT RUN**. Full command `npm test`: **NOT RUN**. Build command `npm run build`: **NOT RUN**. historical implementation snapshot provides artifact inspection and commits but no authorized Node/npm runner; Desktop Commander is restricted to local Apex runtime work and cannot run product tests.
- Browser smoke is deployment-only and cannot verify this historical implementation snapshot source revision. No deployment or publication was performed.

