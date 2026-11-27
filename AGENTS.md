# Agent collaboration guide

Shared GitHub repository: https://github.com/randynlinda4ever-dot/scholarship-scout
Canonical source: https://app.agentgrid.io/artifacts/Y9kTsZ0-vazOq3AnWspbAw. Read `GITHUB_REPOSITORY.md` for branch, review, privacy, and synchronization rules. AgentGrid remains authoritative; GitHub is a collaboration mirror, not an automatically synchronized remote.

Scholarship Scout is a React 18 + TypeScript application using Vite, Supabase Auth, a public Supabase Edge Function for bounded scholarship discovery, and a self-hosted SearXNG gateway.

## Read first

Before making changes, read:

1. `README.md`
2. `docs/README.md`
3. `docs/architecture.md`
4. `docs/anonymous-access.md`
5. `docs/privacy-and-security.md`
6. `docs/roadmap.md`

Check the current artifact revision before editing and re-read files if another agent has committed changes. Prefer small, focused commits. Avoid simultaneous changes to the same files.

## Core privacy and security rules

- Keep student profiles, grades, activities, essays, recommendation notes, tasks, and eligibility assessments in browser storage by default.
- The live discovery payload may contain only state, expected graduation year, and selected category IDs. Do not add personal student data to search requests.
- Never put a Supabase service-role key, secret API key, gateway bearer token, or other server secret in frontend code, checked-in files, or a `VITE_*` variable.
- The Supabase publishable key is browser-safe; it is not a substitute for a server secret.
- Keep Supabase RLS enabled and preserve owner checks based on `auth.uid()`.
- Supabase anonymous users are Auth users with unique identities and the `authenticated` database role. Do not grant the database `anon` role broad table access.
- Anonymous sessions are browser-bound until account linking is implemented. Do not claim cross-device recovery.
- Search results are unverified leads. Do not invent sponsor details, deadlines, awards, or eligibility rules.
- Keep passed, failed, and unknown eligibility outcomes distinct. Missing information must not be treated as an automatic failure.
- Never auto-submit a scholarship application, send a sponsor email, or upload essays or student documents.

## Current backend facts — checked 2026-11-27

- The canonical product source is the AgentGrid artifact `Y9kTsZ0-vazOq3AnWspbAw`. Resolve its latest committed revision from AgentGrid history before every edit. AgentGrid is the source of truth; GitHub is the collaboration/release mirror; Vercel is the production hosting and deployment target, not a source. Verify the exact AgentGrid revision, GitHub commit, Vercel deployment, and domain aliases before publishing. See `docs/source-reconciliation-2026-11-27.md`.
- The existing Supabase project is `wjrwvempgjvoxlioodse`. Supabase reports `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false`; that setting applies only to public discovery and does not make cloud CRUD or other functions public.
- The deployed Supabase version 19 wrapper and the corrected GitHub release candidate both use the bounded in-memory `createPublicRateLimiter()` at two requests per IP per 60 seconds per Edge Function isolate. The browser's `x-scout-client-id` is allowed through CORS but is not a trusted rate-limit identity. The authenticated single-process SearXNG gateway adds a shared ceiling of 30 upstream requests per 60 seconds across Edge Function isolates. This is intentionally no-Redis; it does not provide durable daily quotas or a shared concurrency lease. Source-file parity still requires a reviewed Supabase deployment; never infer it from the function version.
- Supabase metadata reports version 19 while the returned `entrypoint_path` has an internal `_16` suffix. Record this as a provenance discrepancy; it does not prove which historical revision is running. The returned `ezbr_sha256` metadata value is `824617afc4a5b8886424ecd6ad624c302fd3d2ccf2c5fe9993ac1fb59080f2af`; do not mislabel it as a recomputed source-file hash.
- An earlier upstream failure at `2026-11-27T02:48:55.575Z` returned four `network_dns_error` failures against `plugin-loan-anybody-drilling.trycloudflare.com`. A later read-only production smoke check used synthetic Texas/2027/local inputs, returned 40 leads, and was corroborated by a Supabase discovery `POST 200` at `2026-11-27T05:09:06.848Z`. This is one successful request, not sustained-uptime evidence.
- Required backend secrets are `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN`; the owner confirms both are configured. Values were not read or printed. An authenticated request using the local token source reached `https://discovery-gateway.scholarship-scout.org` and returned HTTP 200 with 15 SearXNG results. The saved Quick Tunnel URL `plugin-loan-anybody-drilling.trycloudflare.com` failed and is stale. Upstash secrets are not required by the selected gateway-backed design.
- Do not add a Redis dependency or require Upstash secrets for discovery. Preserve the per-isolate IP limiter and the authenticated gateway's 30-per-minute process ceiling. The Edge Function returns 503 when a trusted client IP cannot be attributed and 429 with `Retry-After` when the isolate quota is exceeded. The gateway's process ceiling is reset by a process restart and has no shared in-flight concurrency lease; treat those limits explicitly before scaling or adding gateway replicas.
- The current database advisors report leaked-password protection disabled (a warning; current sign-in is magic-link based), missing covering indexes on `eligibility_checks.scholarship_id` and `scholarships.source_id`, and two currently unused indexes. Health advisors report no findings. Do not change auth settings or indexes without verifying the relevant product requirements and query patterns.
- Keep student profiles, eligibility, essays, and application-preparation data local. The discovery payload remains limited to state, graduation year, and selected category IDs. Preserve RLS and owner-scoped cloud scholarship CRUD.
- `supabase/legacy/202611090001_scholarship_scout.sql` is an incompatible historical migration. Never apply it.
- See [the current runtime audit](docs/runtime-audit-2026-11-27.md) for evidence, verification limits, and prioritized next work.

## Development checks

Use Node.js 22.12+ (CI uses 22.16.0):

```bash
npm ci
npm test
npm run build
npm audit --audit-level=moderate
```

The latest clean local verification (November 24, 2026; Node.js 26.13.0) recorded 313/313 passing tests, a successful TypeScript/Vite build, and zero audit vulnerabilities. The main JavaScript bundle was 536.70 kB and triggered Vite's non-fatal chunk-size advisory. GitHub CI and real-browser acceptance remain unverified.

## Collaboration handoff

When finishing a task, report:
- What changed and which files were touched.
- The tests/build/audit actually run and their results.
- Any outstanding configuration or live-browser checks.
- Any database, auth, deployment, or privacy impact.

Do not claim an integration works merely because the unit tests pass. Keep the artifact's README, engineering docs, and roadmap aligned with the current committed source and deployed services.
