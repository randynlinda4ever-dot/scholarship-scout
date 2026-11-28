# Verified architecture inventory

## Status and scope

This document records the code and live service state inspected during the current implementation pass. It distinguishes committed source from deployed behavior. It is not a promise that every planned capability is already live.

> **Architecture verification — November 28, 2026:** Production Vercel deployment `dpl_Gj3jNiASBVqF3GhLwk23xaeaVk1j` is READY for GitHub `main` SHA `28137158d8beb3243da295e3f4ffaf6676edfbd0`. Supabase reports `scholarship-discover` ACTIVE v29 (`verify_jwt=false` for this function only) with all five deployed files byte-identical to that `main` baseline; `account-delete` is ACTIVE v4 (`verify_jwt=true`) with executable entrypoint parity after comment removal and an exact shared body-reader match. The app lazy-loads `src/App.tsx` after the legal acceptance gate. The authenticated gateway's process-wide upstream ceiling is 30 requests per minute. The database retains RLS on all five public tables and no direct client CRUD grants on the local-only student tables. See [the current code-quality audit](code-quality-audit-2026-11-28.md), [privacy and security](privacy-and-security.md), and [deployment controls](deployment.md).

## Frontend

- Framework: React 18 with TypeScript.
- Bundler: Vite 8.3.8 with @vitejs/plugin-react 6.3.0.
- Runtime requirement: Node.js 26.13.x, pinned by `.nvmrc` and constrained by `package.json`.
- App entry and primary UI: src/App.tsx, src/App.css, and src/index.css.
- Core logic is separated into modules in src/lib: profile validation/readiness, discovery, eligibility summaries, source evidence, cloud mapping/API, tracker management, application workspace/progress, backup/crypto, browser storage, and local reliability monitoring.
- Unit tests use Node's built-in test runner through npm test.

## Data ownership and flow

Student-specific information stays in the browser by default. Permanent accounts may explicitly opt into an encrypted account backup; guests and anonymous Auth users cannot use this feature:

- Profile and academic details.
- Local scholarship tracker and application statuses.
- Checklist progress and application workspace.
- Essay prompts and drafts.
- Recommendation request notes and dates.
- Personal tags, priorities, and notes.
- Appearance settings and the small local reliability history.

The browser stores these records as AES-256-GCM ciphertext in IndexedDB. After passphrase unlock, the app uses a synchronous in-memory Storage-compatible adapter and queues encrypted writes. An optional cross-device backup re-wraps the same content key with a WebAuthn PRF-derived key and uploads only the encrypted envelope; account auth tokens/PKCE values are kept in a separate device-key-encrypted IndexedDB store and are not synchronized. A Web Locks exclusive lock permits one unlocked tab per origin; inactivity locks after 15 minutes. The legal-acceptance receipt and generic reliability counters remain in localStorage. While unlocked, same-origin JavaScript can access decrypted records in memory, so the vault protects data at rest but is not end-to-end encryption. New backup downloads use a separate user-controlled encrypted backup flow.

Supabase is used for optional magic-link/Google authentication, user-scoped cloud scholarship sponsor records, and the opt-in account_vault_backups ciphertext row for permanent users. Public live discovery does not require or create a Supabase Auth session. Student profile and eligibility tables exist in the database but are not currently used by the app.

Live discovery flow:

1. The browser calls runLiveScholarshipDiscovery directly; public discovery does not reuse or create a Supabase Auth session.
2. The client sends only state, graduation year, and selected discovery category IDs.
3. The public `scholarship-discover` Edge Function validates the request and applies the per-isolate two-per-minute IP limiter. The authenticated single-process gateway independently caps upstream requests at 30 per minute across Edge Function isolates. This selected design requires only the existing SearXNG gateway secrets, not Redis/Upstash credentials. It does not provide a persistent per-client daily quota or shared in-flight concurrency lease.
4. The function calls the fixed HTTPS SearXNG gateway using server-side secrets.
5. Search results return to the browser as unverified leads.

No essay content, contact details, school, grades, class rank, test scores, activities, or personal notes are included in that request.

## System diagram

    Browser / React app
      |-- IndexedDB: encrypted profile, tracker, tasks, essays, and settings
      |-- Separate IndexedDB store: device-key-encrypted Supabase Auth session and PKCE verifier
      |-- in-memory vault adapter: unlocked records; one tab at a time
      |-- localStorage: legal acceptance receipt + generic reliability counters
      |-- public.scholarships: owner-scoped sponsor metadata only
      |-- public.account_vault_backups: optional owner-scoped ciphertext + passkey recovery metadata only
      |
      +--> scholarship-discover (public invocation; verify_jwt=false for this function only)
             |-- state + graduation year + selected category IDs only
             +--> fixed HTTPS SearXNG gateway
                    +--> SearXNG search results

## Current deployed/source parity

The live Supabase inventory reports `scholarship-discover` ACTIVE at version 29 with `verify_jwt=false` for this function only. The five deployed files match the audited `main` baseline byte-for-byte. `account-delete` is ACTIVE at version 4 with `verify_jwt=true`; its entrypoint's executable code matches `main` after comments are removed, and `bounded-json-body.mjs` is byte-identical. The browser discovery payload remains limited to state, graduation year, and selected category IDs. No fresh end-to-end discovery invocation or destructive account-deletion request was performed in this audit. See [the current code-quality audit](code-quality-audit-2026-11-28.md).

The scholarship-verify file in the repository is a disabled placeholder with a kill switch. No scholarship-verify Edge Function is deployed.

## Known architecture questions

- Reconcile the checked-in SQL migration files with the live Supabase migration history before any schema migration.
- Enable Anonymous Sign-Ins and CAPTCHA in the Supabase project, then run real browser smoke tests for anonymous session creation, persistence, and RLS isolation.
- Test optional permanent-account sign-in before an anonymous session is created; email linking from an existing anonymous session is not implemented yet.
- Complete manual spoken screen-reader testing.
- Review future local-data clearing/account deletion flows.
