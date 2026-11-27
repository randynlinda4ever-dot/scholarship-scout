# Scholarship Scout — phased upgrade roadmap

## Guardrails

- Preserve all existing saved profiles, scholarships, checklist progress, and working features.
- Keep student profile information local by default. Cloud storage remains limited to sponsor scholarship records unless a separate privacy design is reviewed and approved.
- Never infer citizenship, financial need, membership, or other sponsor qualifications. Unknown requirements stay unknown.
- Treat search results and extracted sponsor rules as unverified leads until official sponsor evidence is reviewed.
- Never submit scholarship applications, contact sponsors, or share a student's documents automatically.
- Use the existing Supabase project. Do not change its schema, policies, or deployed functions as part of Phase 1.
- Keep the unimplemented sponsor-extraction workflow disabled until its schema, privacy, provider terms, rate limits, and human-review controls are separately tested. Live discovery was documented as scholarship-discover version 7 when this plan was originally written; the later documentation review inspected deployed version 8. This plan does not independently verify the live deployment, and deployed capabilities must be distinguished from the current committed source.

## Phase 1 — Reliability, profile setup, and privacy

**Status: in progress**

- [x] Preserve existing local profile data and merge older profiles with current defaults.
- [x] Keep profile, academic, activity, and student-specific eligibility data out of cloud sponsor records.
- [x] Keep Supabase sessions persistent with automatic refresh and auth-state restoration.
- [x] Add anonymous-first Supabase Auth sessions so live search can start without entering an email or password.
- [ ] Enable Anonymous Sign-Ins in the Supabase Dashboard and add CAPTCHA/Turnstile before public rollout.
- [ ] Test anonymous session persistence, RLS isolation, saved-record access, and retention/cleanup.
- [ ] Implement account linking to a verified email with conflict handling; this is not part of the current code.
- [x] Provide user-initiated encrypted backups and validate imports before replacing local data.
- [x] Add a profile-readiness summary that separates high-impact discovery details from optional matching context.
- [x] Explain why missing profile details can limit matching without turning completeness into an eligibility requirement.
- [x] Report local-storage write failures for profile, tracker, and checklist changes.
- [x] Run the complete unit-test suite, TypeScript/production build, and dependency audit on the refreshed validation workspace (210/210 tests; build passed; zero audit vulnerabilities).
- [ ] Complete real-browser sign-in, session restoration, backup import/export, and storage-failure checks.
- [ ] Review account recovery, account deletion, and local-data clearing flows.

## Phase 2 — Scholarship discovery and source quality

**Status: implementation in progress; deployment and live smoke checks pending**

- [x] Add reusable categories for local and school resources, regional and state awards, academic and humanities programs, leadership, community service, language, employment, arts, college-specific, national, and general opportunities.
- [x] Generate two distinct search query variations per selected category.
- [x] Add up to two result pages per variation to the laptop gateway, with page values bounded to 1–2.
- [x] Limit the app to four selected categories per run and the Edge Function to four categories.
- [x] Run provider requests with bounded concurrency and per-request timeouts.
- [x] Return partial results when some searches fail and include requested/successful/failed/page metrics.
- [x] Canonicalize URLs, remove common tracking parameters, deduplicate repeated source/title records, and preserve category/query/page provenance.
- [x] Rank results using only selected state/year plus scholarship/senior terms and a small institutional-domain signal; show score reasons.
- [x] Keep sponsor identity, award amount, deadline, eligibility, source-check date, and verified status unset until a human checks the official source.
- [x] Run new discovery tests and the full project suite on the current committed discovery revision (105/105 passed).
- [x] Run the TypeScript check and Vite production build on the isolated validation copy of the current source (89 modules transformed; 517.28 kB main JS chunk warning).
- [x] Confirm page 2 through the local gateway and HTTPS tunnel with valid authorization; page bounds/defaults also passed 2/2 gateway unit tests.
- [ ] Deploy the reviewed Edge Function only after separate production approval; no Edge Function deployment was performed in this phase.
- [x] Add anonymous-first Supabase Auth session creation for no-email search, without adding a custom cookie service or extra gateway.
- [ ] Enable Anonymous Sign-Ins and CAPTCHA in the project, then verify JWT acceptance and owner isolation in real browser sessions.
- [ ] Add a more dependable hosted gateway after comparing operational cost, uptime, and security requirements.

## Phase 3 — Eligibility, tracker, and deadlines

- [x] Keep passed, failed, and unknown eligibility outcomes distinct.
- [x] Explain which recorded sponsor rules passed, failed, or still need confirmation.
- [x] Show source-evidence completeness separately from personal eligibility.
- [x] Suggest possible duplicates without automatically merging or deleting records.
- [x] Classify duplicate suggestions as exact, strong, or possible matches while retaining same-sponsor and same-deadline-year guardrails.
- [x] Show date-only deadline urgency without inventing cutoff times or time zones.
- [ ] Add richer requirement operators, multiple qualification paths, and mandatory-versus-preference distinctions.
- [ ] Link each eligibility rule to sponsor evidence.
- [x] Add application status, personal priority, tags, archive/restore without deleting history, submission date, and decision date; preserve these fields in local storage and encrypted backups.
- [ ] Add controlled calendar reminders and deadline export.

## Phase 4 — Application preparation

- [x] Maintain a separate core checklist and workspace for each tracked scholarship.
- [x] Include core checklist progress and application workspace data in user-controlled encrypted version-2 backups; continue importing version-1 backups.
- [x] Add optional suggested document templates and custom scholarship-specific checklist steps.
- [x] Store exact essay prompts, local drafts, word limits, and live word counts; flag drafts that exceed the entered limit.
- [x] Track recommendation requests, requested/due/received dates, and status.
- [x] Track transcript, résumé, recommendation, and custom document requirements, readiness, notes, and due dates; optional suggestions are not automatically treated as required.
- [x] Add a final review checklist and a confirmed manual submission record; decision status/date remain student-controlled in the tracker.
- [x] Keep essay authorship and application submission under the student's control. Drafts and recommendation notes remain local and are not sent to sponsors or discovery services.

## Phase 5 — Accessibility, polish, and expansion

**Status: core implementation complete; Chrome browser and automated accessibility checks passed**

- [x] Convert the scholarship tracker to labeled responsive cards on small screens while retaining the accessible table headers for assistive technology.
- [x] Keep all six navigation destinations visible in a two-column mobile navigation layout with labeled groups; add semantic navigation groups and a skip-to-content link.
- [x] Make each tracker opportunity's review control keyboard operable with an accessible name and visible focus.
- [x] Add an accessible compact/comfortable layout toggle persisted locally.
- [x] Announce offline state, cloud loading, empty results, errors, and local notifications; disable online-only actions while disconnected while leaving local work available.
- [x] Add modal dialog roles and accessible headings, move focus into each dialog, trap Tab/Shift+Tab, close with Escape, restore focus to the opener, and name close controls.
- [x] Preserve visible focus styles and reduced-motion preferences; test accessible names, field labels, landmarks, and status announcements.
- [x] Audit the Chrome accessibility tree for navigation, main landmark, headings, dialogs, buttons, and named controls. A keyboard interaction pass confirms modal focus trapping, Escape behavior, focus restoration, and a visible focused skip link.
- [x] Measure rendered text contrast on all six main screens in dark and light themes. The browser audit reported zero text contrast failures against WCAG AA thresholds (4.5:1 normal text; 3:1 large text).
- [x] Test the responsive app in Chrome at 1440, 768, 390, and 320 CSS pixels; no horizontal overflow was found. Test the tracker with a temporary sample row and confirm its mobile labels and review control render.
- [x] Verify offline banner, local navigation, and disabled cloud research/sign-in controls in Chrome.
- [x] Add a user-initiated local CSV tracker report with separate application and eligibility columns, CSV quoting, and spreadsheet-formula prefix neutralization.
- [x] Add a local-only client reliability monitor for generic runtime errors, unhandled rejections, render failures, and storage-write failures. It stores only allowlisted event types and timestamps, keeps at most 25 entries, can be cleared, and sends no telemetry.
- [x] Add an inline SVG favicon; final Chrome audit reports no console errors or failed network requests.
- [x] Add regression tests for dialog keyboard behavior, CSV safety, local reliability monitoring, notification naming, and the favicon.
- [ ] Complete a spoken Narrator/NVDA screen-reader listen-through. Browser accessibility-tree and ARIA checks passed, but speech output has not been tested with an OS screen reader.
- [ ] Consider multi-device sync only after a documented conflict-resolution and client-side encryption design. Sync remains intentionally disabled.
- [x] Add client-side reliability monitoring and security regression tests. External uptime monitoring remains a separate infrastructure decision.

## Current execution and verification

The discovery upgrade now exposes 18 selectable categories, two query variations per category, up to two result pages per variation, bounded concurrent searches, partial-failure summaries, URL/title deduplication, search provenance, and relevance ranking. Sponsor identity, award amount, deadline, eligibility, and sponsor-check dates remain unset until official sponsor review. The authenticated Edge Function source is committed but has not been deployed.

The tracker separates application progress from eligibility: users can set six workflow states, priority, up to 20 tags, manual submission/decision dates, and archive/restore records. The dashboard displays in-progress, ready, submitted, and awarded counts. Tracker views have independent eligibility, application-status, archive, and search filters plus deadline, priority, award, status, eligibility, and name sorting. The mobile tracker now presents each record as a labeled card, with a keyboard-operable Review control; desktop retains the full table. The tracker can export a local CSV report with application and eligibility status in separate columns.

The laptop gateway now forwards bounded page values (1–2) to SearXNG. Its Node gateway process was restarted so the running service uses the updated code; authenticated local and HTTPS tunnel page-1/page-2 requests both returned 15 results, while out-of-range values were normalized as expected.

The latest implementation adds profile readiness on the Overview and Profile screens. Three core fields (state, current education level, and expected graduation year) are shown separately from optional academic and experience details. Each missing field has an explanation. Citizenship, financial need, and organization membership are excluded from the readiness score; this feature does not alter eligibility calculations.

Phase 4 adds a separate application workspace for every tracked scholarship. In addition to the existing six-step core checklist, students can add custom tasks, store exact essay prompts and private drafts with live word counts, track recommendation requests and dates, mark sponsor-required documents ready, record document deadlines, and complete a five-item final review. Default document suggestions are optional until the student confirms a sponsor requirement. Submission recording is manual and confirmation-gated; it updates the local tracker only and never submits to a sponsor.

Application workspace data is stored in the passphrase-protected IndexedDB local vault using AES-256-GCM and is also included in user-controlled encrypted version-2 backups using the separate existing backup encryption flow. Version-1 backups remain importable and restore with an empty application workspace. Workspace records are validated against scholarship IDs and bounded text/item limits during import. The workspace is not part of the cloud sponsor mapping, SearXNG payload, or cloud discovery results.

Local JSON writes now return an explicit success result. Profile changes update a visible local-save state, and profile/tracker/checklist save failures display a warning that the current tab's changes may not survive a reload. No profile data is sent to Supabase.

Phase 5 adds a skip-to-content link, semantic navigation groups, a two-column mobile navigation layout, responsive labeled tracker cards, keyboard-operable review controls, modal dialog focus management, a locally persisted compact-view toggle, and explicit offline/loading/empty/error announcements. Toasts are polite status announcements with a named dismiss control. Cloud sign-in and live search are disabled while offline, but local scholarship and application preparation remain available. The local tracker CSV export keeps application status separate from eligibility, correctly quotes CSV values, and neutralizes spreadsheet-formula prefixes.

A local-only reliability monitor records generic event categories and timestamps for runtime errors, unhandled promise rejections, React render failures, and browser-storage write failures. It does not store error text, stack traces, URLs, profile data, or draft content; it retains at most 25 entries and sends no telemetry. A recoverable React error boundary provides a reload path when rendering fails. The app also declares an inline SVG favicon to avoid a missing-icon request.

Final verification on the committed Phase 5 source: npm test passes **151/151**; npm run build passes TypeScript and Vite (94 modules; 552.14 kB JS / 154.25 kB gzip; non-fatal chunk-size advisory). A Chrome 157 headless browser audit tested 1440, 768, 390, and 320 CSS-pixel viewports with no horizontal overflow; a sample tracker record rendered as a labeled mobile card. The audit exercised modal roles and names, keyboard focus trapping in both directions, Escape close, focus restoration, skip-link visibility, local navigation while offline, and disabled online-only actions. The Chrome accessibility tree exposed the main landmark, labeled navigation, dialog, headings, and named controls. A rendered-text contrast scan across all six main app screens in both themes reported zero failures against WCAG AA text thresholds. The final run reported zero browser console errors and zero failed network requests.

The browser audit is not a full spoken screen-reader test with Narrator/NVDA or a complete WCAG conformance certification. Those remain explicit manual checks. Multi-device sync remains intentionally disabled pending a separate client-side encryption and conflict-resolution design. External uptime monitoring is not enabled; the implemented reliability history is local-only.

Phase 5 changes are frontend-only. No Supabase schema, RLS policy, migration, deployed Edge Function, or external search service was changed.
