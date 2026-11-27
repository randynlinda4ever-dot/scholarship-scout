# Agent collaboration guide

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

## Current backend facts

- The active Supabase database has four RLS-protected public tables. The app's cloud CRUD is limited to `public.scholarships`.
- The Supabase project `wjrwvempgjvoxlioodse` was rechecked as ACTIVE_HEALTHY on 2026-11-25. The deployed `scholarship-discover` Edge Function is ACTIVE at version 10 with `verify_jwt=false`; its inspected inline source hash is `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`. This does not make cloud CRUD or other functions public.
- The latest inspected function-edge traffic contained seven HTTP 502 POSTs tagged version 9, latest `2026-11-25T15:04:10.559Z`; no version-10 invocation appeared in that result. Treat those failures as v9 evidence, not proof of a fresh v10 failure. No fresh v10 synthetic POST was performed in this audit.
- The live v10 inline function uses a fixed `buildSearchJobs` / `runBoundedSearches` plan. The AgentGrid implementation snapshot used for the source comparison was revision `9eb1e1a99f70f2389a9d4875c48d802d1e5fa6c2`; its wrapper imports a shared helper with adaptive search, bounded retry, a short-lived complete-result cache, and detailed failure-reason codes. The dedicated SC-246 report and status-document refresh were committed as documentation-only revision `bd50d06fc873f4d28cbae60b74af0e2f5465030d`; those edits did not change the product source. The sources are not semantically equivalent; coordinate deployment parity through SC-247.
- Required server-side secret names are `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN`. Their values were not read. Current secret presence/configuration was not verifiable through the connected Supabase tools. A previous Quick Tunnel HTTP 200 with 15 synthetic results is historical evidence only; a stable named tunnel and fresh end-to-end request remain unverified.
- Treat deployed-version observations as distinct from committed source and tests. Tests of committed code do not independently verify the live deployment.
- `supabase/legacy/202611090001_scholarship_scout.sql` is an incompatible historical migration. Do not move it back into the active migrations folder or apply it to the existing project.
- Anonymous Sign-Ins and CAPTCHA still require project-owner configuration. Do not change Supabase settings, database schema, RLS, secrets, or deployments without explicit owner approval.

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
