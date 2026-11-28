# Agent collaboration guide

Canonical source of truth: https://github.com/randynlinda4ever-dot/scholarship-scout. The GitHub repository is the only application source and release history. The `main` branch is the production source branch; changes must be made on focused branches and reviewed through pull requests. Vercel hosts the frontend, and Supabase provides the backend services. All code changes, reviews, and release history must be recorded in this repository.

Scholarship Scout is a React 18 + TypeScript application using Vite, Supabase Auth, a public Supabase Edge Function for bounded scholarship discovery, and a self-hosted SearXNG gateway.

## Read first

Before making changes, read:

1. `README.md`
2. `docs/README.md`
3. `docs/architecture.md`
4. `docs/anonymous-access.md`
5. `docs/privacy-and-security.md`
6. `docs/roadmap.md`

Fetch the latest `origin/main`, inspect the current branch and working tree, and compare the proposed change with the current main commit before editing. Prefer small, focused commits. Avoid simultaneous changes to the same files.

## Core privacy and security rules

- Keep student profiles, grades, activities, essays, recommendation notes, tasks, and eligibility assessments in the encrypted local vault by default. Cross-device copies are permitted only through the explicit, opt-in, client-encrypted account-vault flow; never add plaintext cloud profile/application storage.
- The live discovery payload may contain only state, expected graduation year, and selected category IDs. Do not add personal student data to search requests.
- Never put a Supabase service-role key, secret API key, gateway bearer token, or other server secret in frontend code, checked-in files, or a `VITE_*` variable.
- The Supabase publishable key is browser-safe; it is not a substitute for a server secret.
- Keep Supabase RLS enabled and preserve owner checks based on `auth.uid()`.
- Supabase anonymous users are Auth users with unique identities and the `authenticated` database role. Do not grant the database `anon` role broad table access.
- Guest and anonymous sessions are browser-bound and are not eligible for account-vault sync. Permanent signed-in accounts may opt into the separate encrypted backup using WebAuthn PRF/passkey recovery or the existing vault passphrase; do not imply that sign-in alone enables sync.
- Search results are unverified leads. Do not invent sponsor details, deadlines, awards, or eligibility rules.
- Keep passed, failed, and unknown eligibility outcomes distinct. Missing information must not be treated as an automatic failure.
- Never auto-submit a scholarship application, send a sponsor email, or upload essays or student documents.

## Current backend facts — checked 2026-11-27

- The existing Supabase project is `wjrwvempgjvoxlioodse`. Supabase reported `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false`; that setting applies only to public discovery and does not make cloud CRUD or other functions public.
- The deployed Supabase version 19 wrapper and the reviewed GitHub release candidate use the bounded in-memory `createPublicRateLimiter()` at two requests per IP per 60 seconds per Edge Function isolate. The browser's `x-scout-client-id` is allowed through CORS but is not a trusted rate-limit identity. The authenticated single-process SearXNG gateway adds a shared ceiling of 30 upstream requests per 60 seconds across Edge Function isolates. This is intentionally no-Redis; it does not provide durable daily quotas or a shared concurrency lease. Check deployed function source separately; never infer source parity from a version number.
- Supabase metadata reported version 19 while the returned `entrypoint_path` had an internal `_16` suffix. Treat this as a provenance discrepancy, not proof of which historical revision is running.
- An authenticated production discovery request using synthetic Texas/2027/local inputs returned 40 leads and was corroborated by a Supabase discovery `POST 200` at `2026-11-27T05:09:06.848Z`. This is one successful request, not sustained-uptime evidence.
- Required backend secrets are `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN`; the owner confirmed both are configured. Never read or print their values. An authenticated request to `https://discovery-gateway.scholarship-scout.org` returned HTTP 200 with 15 SearXNG results.
- Do not add a Redis dependency or require Upstash secrets for discovery. Preserve the per-isolate IP limiter and the authenticated gateway's 30-per-minute process ceiling. The Edge Function returns 503 when a trusted client IP cannot be attributed and 429 with `Retry-After` when the isolate quota is exceeded. The gateway's process ceiling resets on process restart and has no shared in-flight concurrency lease; treat those limits explicitly before scaling or adding gateway replicas.
- Prior database advisors reported leaked-password protection disabled, missing covering indexes on `eligibility_checks.scholarship_id` and `scholarships.source_id`, and two currently unused indexes. Health advisors reported no findings. Do not change auth settings or indexes without verifying requirements and query patterns.
- Keep student profiles, eligibility, essays, and application-preparation data local. The discovery payload remains limited to state, graduation year, and selected category IDs. Preserve RLS and owner-scoped cloud scholarship CRUD.
- `supabase/legacy/202611090001_scholarship_scout.sql` is an incompatible historical migration. Never apply it.
- See [the runtime audit](docs/runtime-audit-2026-11-27.md) for evidence, verification limits, and prioritized next work.

## Development checks

Use Node.js 26.13.x as pinned by .nvmrc and constrained by package.json (>=26 and <27):

```bash
npm ci
npm test
npm run build
npm audit --audit-level=moderate
```

## Collaboration handoff

When finishing a task, report:
- What changed and which files were touched.
- The tests/build/audit actually run and their results.
- Any outstanding configuration or live-browser checks.
- Any database, auth, deployment, or privacy impact.

Do not claim an integration works merely because unit tests pass. Keep the project README, engineering docs, and roadmap aligned with the committed source and deployed services.
