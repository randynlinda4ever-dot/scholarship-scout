# Verified architecture inventory

## Status and scope

This document records the code and live service state inspected during the current implementation pass. It distinguishes committed source from deployed behavior. It is not a promise that every planned capability is already live.

> **Current architecture reconciliation — November 27, 2026:** Latest AgentGrid documentation revision: `fd7c990bcc5a4a493fd20ab23c871e5d5e452b12`; the wrapper and regression tests were last executed at `df84889396d5d5176051b9cd1f4595c2686b0167`, and later changes were documentation-only. The active GitHub workspace still lazy-loads the monolithic `src/App.tsx` after `LegalAcceptanceGate`; the modular page/components/styles in GitHub are preserved but not wired into the runtime. Supabase discovery is ACTIVE at version 19 with the in-memory per-isolate limiter. The corrected GitHub release wrapper retains that no-Redis limiter and the existing authenticated gateway's 30-per-minute process-wide upstream ceiling; Upstash is not required. The gateway owner confirms the two gateway secrets are configured, and an authenticated request to the named tunnel returned HTTP 200 with 15 results. Production function source parity still requires a reviewed deployment. See [the source reconciliation record](source-reconciliation-2026-11-27.md) and [runtime audit](runtime-audit-2026-11-27.md).

## Frontend

- Framework: React 18 with TypeScript.
- Bundler: Vite 8.3.8 with @vitejs/plugin-react 6.3.0.
- Runtime requirement: Node.js 22.12 or newer.
- App entry and primary UI: src/App.tsx, src/App.css, and src/index.css.
- Core logic is separated into modules in src/lib: profile validation/readiness, discovery, eligibility summaries, source evidence, cloud mapping/API, tracker management, application workspace/progress, backup/crypto, browser storage, and local reliability monitoring.
- Unit tests use Node's built-in test runner through npm test.

## Data ownership and flow

Student-specific information stays in the browser by default:

- Profile and academic details.
- Local scholarship tracker and application statuses.
- Checklist progress and application workspace.
- Essay prompts and drafts.
- Recommendation request notes and dates.
- Personal tags, priorities, and notes.
- Appearance settings and the small local reliability history.

The browser stores these records as AES-256-GCM ciphertext in IndexedDB. After passphrase unlock, the app uses a synchronous in-memory Storage-compatible adapter and queues encrypted writes. A Web Locks exclusive lock permits one unlocked tab per origin; inactivity locks after 15 minutes. The legal-acceptance receipt and generic reliability counters remain in localStorage. While unlocked, same-origin JavaScript can access decrypted records in memory, so the vault protects data at rest but is not end-to-end encryption. New backup downloads use a separate user-controlled encrypted backup flow.

Supabase is used for optional magic-link authentication and user-scoped cloud scholarship sponsor records. Public live discovery does not require or create a Supabase Auth session. An authenticated Supabase user is required for cloud scholarship CRUD; the client reads and writes public.scholarships only. Student profile and eligibility tables exist in the database but are not currently used by the app.

Live discovery flow:

1. The browser calls runLiveScholarshipDiscovery directly; public discovery does not reuse or create a Supabase Auth session.
2. The client sends only state, graduation year, and selected discovery category IDs.
3. The public `scholarship-discover` Edge Function validates the request and applies the per-isolate two-per-minute IP limiter. The authenticated single-process gateway independently caps upstream requests at 30 per minute across Edge Function isolates. This selected design requires only the existing SearXNG gateway secrets, not Redis/Upstash credentials. It does not provide a persistent per-client daily quota or shared in-flight concurrency lease.
4. The function calls the fixed HTTPS SearXNG gateway using server-side secrets.
5. Search results return to the browser as unverified leads.

No essay content, contact details, school, grades, class rank, test scores, activities, or personal notes are included in that request.

## System diagram

    Browser / React app
      |-- IndexedDB: encrypted profile, tracker, tasks, essays, settings, Supabase session
      |-- in-memory vault adapter: unlocked records; one tab at a time
      |-- localStorage: legal acceptance receipt + generic reliability counters
      |-- public.scholarships: owner-scoped sponsor metadata only
      |
      +--> scholarship-discover (public invocation; verify_jwt=false for this function only)
             |-- state + graduation year + selected category IDs only
             +--> fixed HTTPS SearXNG gateway
                    +--> SearXNG search results

## Current deployed/source difference

Supabase currently reports `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false`. Its returned deployed entrypoint instantiates `createPublicRateLimiter()`, the per-isolate in-memory limiter. The corrected GitHub release wrapper preserves that same limiter behavior and retains the browser `x-scout-client-id` CORS header; it does not require Upstash. The existing gateway has a process-wide 30-request-per-minute ceiling. The returned deployed file set is still not byte-identical to the release candidate, so source parity requires a separate reviewed deployment. An earlier function failure used an obsolete Quick Tunnel hostname; the current named-tunnel endpoint was subsequently authenticated and returned HTTP 200 with 15 results from the laptop. The browser payload remains limited to state, graduation year, and selected category IDs. See [the current runtime audit](runtime-audit-2026-11-27.md) for the remaining provenance details.

The scholarship-verify file in the repository is a disabled placeholder with a kill switch. No scholarship-verify Edge Function is deployed.

## Known architecture questions

- Reconcile the checked-in SQL migration files with the live Supabase migration history before any schema migration.
- Enable Anonymous Sign-Ins and CAPTCHA in the Supabase project, then run real browser smoke tests for anonymous session creation, persistence, and RLS isolation.
- Test optional permanent-account sign-in before an anonymous session is created; email linking from an existing anonymous session is not implemented yet.
- Complete manual spoken screen-reader testing.
- Review future local-data clearing/account deletion flows.
