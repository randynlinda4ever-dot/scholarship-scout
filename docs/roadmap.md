# Scholarship Scout implementation roadmap

> **Recovery overlay — November 24, 2026:** The local clean-install/test/build/audit gate now passes (313/313 tests; build passed; 0 audit vulnerabilities). Product-level live discovery remains blocked by the offline local search stack; GitHub CI, production source provenance, browser E2E, and Apex orchestration acceptance are still open. The checkboxes below preserve the historical implementation roadmap and do not imply those live gates have passed. See [recovery status](recovery-status-2026-11-24.md).

## P0 — correctness, privacy, and recovery

Status: core code and automated verification complete; project-level configuration and browser checks remain open.

- [x] Correct false eligibility failures when required profile details are missing.
- [x] Require explicit citizenship evidence rather than substring matching.
- [x] Correct incomplete ACT-or-SAT alternative handling and numeric grade formats.
- [x] Keep date-only deadlines valid through the complete local calendar day.
- [x] Reconcile Cloud Search UI with deployed function version 7 as it existed at the time of that completed work, and disable unsupported categories.
- [x] Add rollback-capable local-storage writes for backup restore.
- [x] Validate restored profile fields and update UI state only after storage writes succeed.
- [x] Add anonymous-first Supabase Auth session creation for live research; reuse an existing browser session and do not ask for an email or password.
- [x] Keep student profile details and essays local; only state, graduation year, and selected categories are sent to SearXNG.
- [x] Confirm the existing four public tables have RLS and owner policies using `auth.uid()`.
- [x] Run the full test suite, TypeScript check, production build, and dependency audit on the refreshed validation workspace (210/210 tests; build passed; 0 audit vulnerabilities).
- [ ] Enable Anonymous Sign-Ins in the Supabase Dashboard.
- [ ] Add CAPTCHA/Turnstile to protect public anonymous session creation.
- [ ] Run a real-browser smoke test for first session creation, reload persistence, and owner-scoped cloud saves.
- [ ] Test isolation with two independent anonymous browser profiles.
- [ ] Define retention and safe cleanup for anonymous Auth users and their cloud sponsor records.
- [ ] Exercise backup restore and failure rollback in a real browser.
- [ ] Reconcile checked-in migrations with live database migration history.

## P1 — discovery quality and application workflows

- [ ] Review and deploy the expanded Edge Function only with explicit approval and end-to-end validation.
- [x] Classify duplicate suggestions as exact, strong, or possible without auto-merging records.
- [x] Keep duplicate comparisons gated by same normalized sponsor and deadline year.
- [ ] Complete the source-review lifecycle and reporting for questionable listings.
- [ ] Model mandatory, preferred, and optional eligibility rules explicitly.
- [ ] Link each eligibility rule to sponsor evidence.
- [x] Treat date-only deadlines as calendar dates rather than inferred timestamps.
- [ ] Add user-controlled deadline reminders and export.
- [ ] Implement anonymous-account linking to a verified email while preserving the same user ID; design and test conflict handling before enabling it.
- [ ] Complete E2E coverage for tracker CRUD, essays, checklist persistence, backup, and offline workflows.
- [ ] Finish manual keyboard and screen-reader verification.

## P2 — performance and operations

- [ ] Measure current build chunks and mobile performance on the current revision.
- [ ] Apply route-level splitting only where profiling shows a benefit.
- [ ] Review foreign-key indexing findings against actual queries and migration history.
- [ ] Add privacy-reviewed operational monitoring only if there is a demonstrated need; current diagnostics remain local-only.
- [ ] Improve exports and restore diagnostics without including unrelated profile data.

## P3 — optional expansion

- [ ] Evaluate automated sponsor-page change detection with mandatory human review.
- [ ] Expand search categories and ranking after deployment parity is solved.
- [ ] Evaluate PWA/offline caching and service-worker risks.
- [ ] Consider multi-device sync only after a separate opt-in privacy, encryption, and conflict-resolution design.

## Non-negotiable constraints

- Student profiles, essays, tasks, notes, and student-specific eligibility remain local by default.
- A search result is not automatically verified.
- Missing information is not an ineligibility failure.
- No production migration, project-setting change, or deployment without separate approval.
- Keep each code change small, tested, and reversible.
