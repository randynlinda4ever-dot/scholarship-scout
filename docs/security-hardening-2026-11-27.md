# Security hardening update — November 27, 2026

## Source and release status

GitHub `main` is the only canonical application source. This document preserves historical security implementation details and backend verification limits from November 27, 2026. Its historical revision references do not identify another active source or synchronization service. Vercel is the frontend host; Supabase is the backend runtime.

## Completed application hardening

### Passphrase-protected local vault

- Added `src/lib/localVault.js` and a pre-React unlock/create gate.
- Profile, tracker, checklist, essay, recommendation, application-workspace, appearance settings, and Supabase Auth session/PKCE verifier records are encrypted before persistence in IndexedDB.
- Encryption: AES-256-GCM with a fresh 12-byte IV and a 128-bit authentication tag. The passphrase-derived key uses PBKDF2-SHA-256 with 600,000 iterations and a random 16-byte salt.
- The passphrase and CryptoKey are not persisted. Decrypted values and the key remain in memory only while the vault is unlocked.
- Only Scholarship Scout `scout-*` keys plus the exact configured Supabase session/PKCE keys are migrated; the legal receipt, generic reliability counters, and unrelated same-origin localStorage keys remain untouched.
- Migration writes the encrypted envelope, reads it back, decrypts it, compares the record set, and only then removes plaintext legacy records. An interrupted migration can be resumed by unlocking the saved vault.
- The app requires the Web Locks API and obtains an exclusive origin-wide lock so two tabs cannot concurrently write the same vault. It automatically locks after 15 minutes without activity and exposes a manual lock control in Settings.
- Persistence failures raise an in-app warning and block a safe lock until a later encrypted write succeeds. A before-unload warning is shown while writes are pending or have failed.
- The legal-acceptance receipt and generic reliability counters remain local-only metadata. The Terms version is `2026-11-26.2` and discloses the vault's limits.
- The vault is at-rest encryption, not end-to-end encryption. Same-origin JavaScript running while unlocked, compromised extensions, malware, or an unlocked device can access decrypted memory. There is no passphrase reset/recovery; users must retain a separate encrypted backup.

### Browser security policy and supply chain

- Added a restrictive CSP meta policy before executable scripts in `index.html`: same-origin scripts, no objects, same-origin base/forms, allowlisted Supabase API/WebSocket, and the current Google Fonts origins. Inline styles remain allowed for current React style attributes; inline scripts and `unsafe-eval` are not allowed.
- GitHub Actions use immutable commit SHAs; checkout credentials are not persisted. CI retains install, dependency audit, tests, and production build checks; Dependabot and dependency review are configured.
- This CSP is not an HTTP response header and cannot set `frame-ancestors`, HSTS, `X-Content-Type-Options`, or `Permissions-Policy`.

## Live database state and remaining owner action

The live migration `20261127052519_restrict_public_default_privileges_for_postgres` was applied and verified for the `postgres` creator role. It revokes default grants to `anon` and `authenticated` for future public tables, sequences, and functions created by `postgres`, while preserving `service_role` defaults.

The connected database session is `postgres`. PostgreSQL rejected both `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` and `SET ROLE supabase_admin` with permission denied. The `supabase_admin` defaults remain broad. The owner-only SQL is prepared in `supabase/manual/restrict_public_default_privileges_for_supabase_admin.sql`; do not mark this finding resolved until an authorized owner session runs it and a fresh `pg_default_acl` query returns no `anon` or `authenticated` grantees for `supabase_admin` in `public`.

## Production discovery and public abuse protection

The corrected reviewed GitHub Edge Function entrypoint uses `createPublicRateLimiter()` from `_shared/discovery-rate-limit.mjs`. It applies a two-per-minute per-IP limit per isolate and trusts only Cloudflare's `cf-connecting-ip` header. The authenticated single-process gateway supplies the shared 30-upstream-requests-per-minute ceiling across isolates. This no-Redis design fits the current single-gateway topology; it does not provide durable daily quotas or shared in-flight concurrency leases.

The live Supabase function remains at version 19 using the in-memory per-isolate limiter. The connected Supabase tools do not expose Edge Function secret read/write or invoke operations. The owner confirms the required `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` settings are configured; an authenticated direct check of the named gateway returned HTTP 200 with 15 results. The corrected source wrapper now uses the existing gateway-backed no-Redis design; a reviewed deployment, fresh Supabase-to-gateway POST, and rollback verification remain outstanding. See `docs/supabase-owner-security-runbook-2026-11-27.md`.

Turnstile is not yet wired to the public discovery request. Cloudflare's robots directives restrict some training crawlers but are not request-level bot protection.

## Published hosting headers

A live SecurityHeaders scan of `https://scholarship-scout.org` at 2026-11-27 05:51 UTC returned grade D. HSTS was present, but the scanner did not see CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy as response headers. The live page still served the older legal notice, so historical implementation snapshot source changes have not yet been published to that domain. The hosting layer must add and verify the response headers. The `frame-ancestors` directive can only be set in an HTTP CSP header; determine approved preview iframe parent origins before configuring it. Do not blindly set `X-Frame-Options: SAMEORIGIN` if cross-origin preview embedding is required.

## Verification limits

- Regression tests for vault encryption/migration, wrong passphrases, tampered ciphertext, Supabase session/PKCE storage, lock/unlock, single-tab locking, and failed persistence are maintained in the GitHub repository.
- The historical implementation snapshot MCP surface itself has no project shell/test-runner action. However, the connected local release checkout was used to run `npm ci`, the full `npm test` suite (730 passed, zero failed, zero skipped), `npm run build`, and `npm audit --audit-level=moderate` (zero vulnerabilities) after the corrected wrapper and regression tests were applied. The tested checkout contained the reviewed application and Edge Function source from the GitHub repository.
- A synthetic public discovery request was attempted through a browser automation run, but the run was cancelled and returned no HTTP result. No new production 200/429/503 behavior is claimed.
- No Edge Function was deployed, no gateway secret was read or changed, and no Cloudflare/hosting response-header rule was changed. Upstash is not required by the selected architecture.


## Follow-up: discovery limiter decision corrected — November 27, 2026

The earlier Upstash recommendation in this report is superseded for the current single-gateway topology. The gateway already has an authenticated process-wide ceiling of 30 `/search` requests per 60 seconds. The Edge Function's per-isolate IP throttle remains in place. The corrected GitHub release wrapper no longer requires `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN`; the Upstash module remains an optional future scale-up path only.

The owner confirms the SearXNG gateway secrets are configured. An authenticated request from the laptop reached the named tunnel and returned 15 results; the obsolete Quick Tunnel hostname failed. No secret was printed or modified, and no production function deployment was made. The no-Redis design's limitations (no durable daily quotas, no shared in-flight concurrency lease, and process-counter reset on restart) are recorded in `docs/rate-limit-decision-2026-11-27.md`.