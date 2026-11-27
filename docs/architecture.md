# Verified architecture inventory

## Status and scope

This document records the code and live service state inspected during the current implementation pass. It distinguishes committed source from deployed behavior. It is not a promise that every planned capability is already live.

> **Current runtime status — November 25, 2026:** `scholarship-discover` is ACTIVE at version 9. The latest relevant Supabase invocation log inspected during the search audit recorded HTTP 502 at `2026-11-25T02:03:32.146000`; the local SearXNG/gateway/tunnel stack was reported offline. The deployed function is an inline snapshot (SHA-256 `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`); the committed Edge Function wrapper imports a separate shared helper, and source parity is not established. Optimizations in that helper are not live until reviewed and deployed. See [the recovery report](recovery-status-2026-11-24.md) and [Agent 03 search/discovery audit](agent-03-search-discovery-audit-2026-11-25.md).

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

The browser stores this information in localStorage. It is not encrypted at rest. New backup downloads are encrypted by the user-controlled backup flow. Same-origin JavaScript can read localStorage, so this storage must not be described as a secure vault.

Supabase is used for optional magic-link authentication and user-scoped cloud scholarship sponsor records. Public live discovery does not require or create a Supabase Auth session. An authenticated Supabase user is required for cloud scholarship CRUD; the client reads and writes public.scholarships only. Student profile and eligibility tables exist in the database but are not currently used by the app.

Live discovery flow:

1. The browser calls runLiveScholarshipDiscovery directly; public discovery does not reuse or create a Supabase Auth session.
2. The client sends only state, graduation year, and selected discovery category IDs.
3. The public scholarship-discover Edge Function (ACTIVE version 9; JWT verification disabled for this function only) validates the request.
4. The function calls the fixed HTTPS SearXNG gateway using server-side secrets.
5. Search results return to the browser as unverified leads.

No essay content, contact details, school, grades, class rank, test scores, activities, or personal notes are included in that request.

## System diagram

    Browser / React app
      |-- localStorage: profile, tracker, tasks, essays, settings
      |-- Supabase Auth: persistent anonymous or permanent-user session
      |-- public.scholarships: owner-scoped sponsor metadata only
      |
      +--> scholarship-discover (public invocation; verify_jwt=false for this function only)
             |-- state + graduation year + selected category IDs only
             +--> fixed HTTPS SearXNG gateway
                    +--> SearXNG search results

## Current deployed/source difference

The deployed `scholarship-discover` function is ACTIVE at version 9 with `verify_jwt=false` for this function only. Direct Supabase inspection identified an inline deployed source snapshot (SHA-256 `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`). It accepts up to four categories and runs two query variations and up to two pages per category (up to 16 requests), with concurrency four, a 15-result page cap, a 40-result final cap, and 12-second upstream timeout. Its per-IP rate limiter is in-memory per isolate, limited to two requests per 60 seconds, and is best-effort rather than distributed. The live implementation does not have the adaptive expansion, cache, or transient retry now present in the committed shared helper. The repository wrapper imports that helper, but the helper is not proven equivalent to the deployed inline snapshot and the new changes have not been deployed. The browser payload remains limited to state, graduation year, and selected category IDs. Never infer deployed behavior solely from repository source, tests, or matching version numbers.

The scholarship-verify file in the repository is a disabled placeholder with a kill switch. No scholarship-verify Edge Function is deployed.

## Known architecture questions

- Reconcile the checked-in SQL migration files with the live Supabase migration history before any schema migration.
- Enable Anonymous Sign-Ins and CAPTCHA in the Supabase project, then run real browser smoke tests for anonymous session creation, persistence, and RLS isolation.
- Test optional permanent-account sign-in before an anonymous session is created; email linking from an existing anonymous session is not implemented yet.
- Complete manual spoken screen-reader testing.
- Review future local-data clearing/account deletion flows.
