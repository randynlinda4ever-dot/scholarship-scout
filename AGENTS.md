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

## Current backend facts — checked 2026-11-28

- The existing Supabase project is `wjrwvempgjvoxlioodse`. Supabase reports `scholarship-discover` ACTIVE at version 29 with `verify_jwt=false`; this public setting applies only to discovery and does not make cloud CRUD or other functions public.
- The complete deployed discovery bundle contains five files, each byte-for-byte identical to the corresponding GitHub `main` file at audit baseline `28137158d8beb3243da295e3f4ffaf6676edfbd0`: the entrypoint, `discovery-rate-limit.mjs`, `scholarship-discovery.mjs`, `us-states.mjs`, and `search-snippet-evidence.mjs`. The entrypoint wires only `createPublicRateLimiter()`.
- The active rate-limit design is intentionally no-Redis: two requests per trusted IP per 60 seconds per Edge Function isolate, plus the authenticated single-process SearXNG gateway's 30-request-per-60-second process ceiling. `createUpstashRateLimiter()` remains optional shared-module code but is not wired or used; no Upstash secrets are required. These controls do not provide a durable daily quota or shared concurrency lease.
- The browser's `x-scout-client-id` is an abuse-bucketing hint, not an authenticated identity. Trust only Cloudflare's `cf-connecting-ip` value, which must be overwritten by the trusted edge; never trust `x-real-ip`. The Edge Function fails closed with HTTP 503 when a trusted address cannot be attributed and returns HTTP 429 with `Retry-After` when the isolate quota is exceeded.
- `account-delete` is ACTIVE at version 4 with `verify_jwt=true`. Its deployed entrypoint differs from current `main` only in comments/formatting; executable logic is equivalent after comments are removed, and the deployed `_shared/bounded-json-body.mjs` is byte-for-byte identical. No real account deletion was used as a test.
- Vercel production deployment `dpl_Gj3jNiASBVqF3GhLwk23xaeaVk1j` is READY for this exact `main` SHA. The apex domain is verified and attached; `www` is verified and configured to redirect to the apex with HTTP 308. Project metadata reports `live=false` despite the READY production deployment and active aliases; do not interpret that flag alone as an outage.
- Required backend secrets are `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN`; keep them server-side and never read or print their values. The previous synthetic production request returning 40 leads is historical evidence, not a sustained-uptime guarantee.
- The live database advisor still warns that leaked-password protection is disabled; the current app uses magic links and Google OAuth, not password authentication. A performance warning about RLS init plans conflicts with the live policy definitions and applied optimization migration; see the current code-quality audit before changing policies. Do not drop advisor-reported unused indexes without query evidence.
- Keep student profiles, eligibility, essays, and application-preparation data local. The discovery payload remains limited to state, graduation year, and selected category IDs. Preserve RLS and owner-scoped cloud scholarship CRUD.
- `supabase/legacy/202611090001_scholarship_scout.sql` is an incompatible historical migration. Never apply it.
- See [the current code-quality audit](docs/code-quality-audit-2026-11-28.md) for evidence, limitations, and deferred work.

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
