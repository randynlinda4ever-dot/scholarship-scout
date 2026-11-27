# Verified architecture inventory

## Status and scope

This document records the code and live service state inspected during the current implementation pass. It distinguishes committed source from deployed behavior. It is not a promise that every planned capability is already live.

> **Current architecture reconciliation — November 27, 2026:** Latest AgentGrid HEAD inspected: `336ed785daedcf4ba02650d79786545bee6a2edf`. The active GitHub workspace still lazy-loads the monolithic `src/App.tsx` after `LegalAcceptanceGate`; the modular page/components/styles in GitHub are preserved but not wired into the runtime. Supabase discovery is ACTIVE at version 19, with an in-memory per-isolate limiter deployed; current AgentGrid/GitHub source uses the separate Upstash-backed wrapper. Secret presence is unverified and the backend has not been changed. One prior synthetic production search returned 40 leads and POST 200; this proves one successful request, not sustained availability. See [the source reconciliation record](source-reconciliation-2026-11-27.md) and [runtime audit](runtime-audit-2026-11-27.md).

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
3. The public `scholarship-discover` Edge Function validates the request. AgentGrid source now uses the shared Upstash limiter; the live Supabase deployment was last observed at version 19 with an in-memory per-isolate limiter. Do not deploy the source wrapper until the Upstash secrets and rollback package are verified.
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

Supabase currently reports `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false`. The returned deployed entrypoint still instantiates `createPublicRateLimiter()`, the per-isolate in-memory limiter. Its returned shared helper does include adaptive search, cache, and bounded retries. The canonical AgentGrid wrapper instead imports `createUpstashRateLimiter` from the separate shared rate-limit module and configures distributed quotas/concurrency leases. That wrapper/module is not present in the returned deployed file set, so source parity is incomplete. The latest observed function failure was four upstream DNS errors against an obsolete Quick Tunnel hostname. The browser payload remains limited to state, graduation year, and selected category IDs. See [the current runtime audit](runtime-audit-2026-11-27.md) for the metadata discrepancy and exact evidence.

The scholarship-verify file in the repository is a disabled placeholder with a kill switch. No scholarship-verify Edge Function is deployed.

## Known architecture questions

- Reconcile the checked-in SQL migration files with the live Supabase migration history before any schema migration.
- Enable Anonymous Sign-Ins and CAPTCHA in the Supabase project, then run real browser smoke tests for anonymous session creation, persistence, and RLS isolation.
- Test optional permanent-account sign-in before an anonymous session is created; email linking from an existing anonymous session is not implemented yet.
- Complete manual spoken screen-reader testing.
- Review future local-data clearing/account deletion flows.
