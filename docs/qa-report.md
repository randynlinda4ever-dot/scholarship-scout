# Scholarship Scout QA report

> **Current status:** The November 24, 2026 recovery evidence is maintained in [recovery-status-2026-11-24.md](recovery-status-2026-11-24.md). The QA snapshots below are historical and should not be treated as current deployment verification.

## Final focused QA update — November 13, 2026

Current artifact revision reviewed immediately before this documentation edit: `07940b7417b086b4f000e8b06afeada5c07f7470`. This is the pre-edit revision; the artifact-edit response is the authority for the resulting revision.

The latest discovery implementation is commit `2905ae7dc31012124d146b559b965c46c517eda7`, with follow-up commits:
- `2a0b34f0cbf8c5c237be22ef91ac31536fbda627` — correct payload privacy assertion.
- `0b02ff098672fddba4758db3d655bff139606a96` — cover upstream and final result caps.
- `07940b7417b086b4f000e8b06afeada5c07f7470` — isolate validation-test rate-limit state.

The focused Edge Function helper/test files were copied from revision `07940b7417b086b4f000e8b06afeada5c07f7470` to an isolated local QA directory and tested on Windows with Node.js v26.13.0:

- Command run: `node --test tests/scholarshipDiscoverEdge.test.mjs`.
- Result: **15 passed, 0 failed; exit code 0**.
- The first run exposed test-only rate-limit state leaking between invalid-request assertions (a later assertion received HTTP 429 rather than the expected HTTP 400). The validation test was corrected to construct a fresh handler/rate limiter per independent request; the subsequent focused run passed.

The current test suite uses synthetic requests, fixed timestamps, deterministic UUIDs, fake gateway responses, and injected fetch implementations. The helper tests do not make network requests. The privacy guard test verifies that extra school, GPA, and email fields are not included in generated upstream queries. Eligibility fixtures are explicitly synthetic (for example, “Synthetic Student” and “Example Fictional High School”), and a source-level test guards those fixture labels. Search results remain `unverified_lead`; official sponsor verification, award details, deadlines, and eligibility remain unknown until a human checks authoritative sources.

Static review of the current committed adapter and helper found the shared module is imported by the Deno Edge Function. The adapter handles preflight `OPTIONS` requests and applies the Supabase CORS headers to handler responses. The deployed-function facts documented below remain version 8 with `verify_jwt=false` for `scholarship-discover` only; this review did not change Supabase configuration or deployment. The source describes 14 allowed categories, at most four selected categories, two query variations and two pages per category (maximum 16 upstream page requests), concurrency four, 15 results per upstream page, 40 final results, 12-second upstream timeouts, an 8 KiB request-body limit, and a best-effort in-memory limit of two requests per 60 seconds per isolate. The limiter is not distributed.

**Not run in this final focused review:** `npm test`, `npm run build`, TypeScript declaration resolution, Deno type-check, Deno runtime test, deployed CORS smoke test, and live gateway/Edge Function smoke test. Deno was not installed in the reported local environment, and the full project dependencies were not installed for this focused run. The older November 12 full-suite/build/audit results below are historical results from revision `95b3ca3f032adf0e13f38e2c656dbbd68a019732`, not results for the current revision.

No production code was changed in the final QA documentation update. No private student records, personal profile values, access tokens, or tunnel hostnames were used or added. No Supabase metadata was queried in this focused review; no database, auth, RLS, secrets, function configuration, or deployment changes were made.

### Remaining verification

Run from the repository root in a local environment with Node.js and lockfile dependencies installed:

1. `npm ci`
2. `npm test`
3. `npm run build`
4. `deno check supabase/functions/scholarship-discover/index.ts`
5. Run a controlled local Edge Function/CORS smoke test with synthetic input and stubbed gateway dependencies; do not use production credentials or student data.

Keep the Deno compatibility/type-check, full-project test/build, and deployed integration checks outstanding until their commands have actually passed.

---

> **Historical snapshot — November 12, 2026.** The revision and results below describe the validation performed at that time only; they are not verification of the current artifact HEAD. The artifact has changed since this snapshot.

## Historical application and source validation — November 12, 2026

Validated artifact revision at that time: `95b3ca3f032adf0e13f38e2c656dbbd68a019732`.

On the Windows validation workspace using Node.js 26.13.0:

- `npm test`: **217/217 passed**, 0 failed.
- `npm run build`: TypeScript and Vite production build passed; 82 modules transformed.
- `npm audit --audit-level=moderate`: **0 vulnerabilities**.

The tests cover same-frame magic-link callback generation, the public live-search client path, public result rendering while signed out, request bounds, category capabilities, and existing local eligibility, tracker, backup, profile, and accessibility behavior.

## Authentication and public search changes

- Live scholarship search no longer calls `ensureCloudUser()` or requires a Supabase user session.
- Public search uses the Edge Function's browser-safe publishable API key. The deployed function was inspected at version 8 with `verify_jwt=false` for this function only.
- The inspected version-8 source allows local, school_resources, regional, state, academic, humanities, leadership, community_service, language, employment, arts, incoming_college, national, general, caps requests at four categories and 8 KiB, performs two variations/category and up to two pages/variation (up to 16 upstream page requests), uses concurrency four, 12-second upstream timeouts, at most 15 results per upstream page and 40 final results, and a best-effort in-memory per-IP limit of two requests per 60 seconds per isolate. This is not a distributed/robust limiter; no CAPTCHA is implemented.
- These are deployed-version facts from source inspection, not proof from the historical test run or a statement that repository tests verify live configuration.
- Cloud scholarship reads and writes still require a real Supabase user and remain owner-scoped through the existing RLS policies.
- Magic-link callbacks now use the running app frame's HTTPS origin rather than the outer AgentGrid artifact URL.
- Supabase's email provider is enabled. The project still needs the current embedded preview callback pattern in its Redirect URLs allow-list for this preview runtime.

## Live integration validation

- The laptop's SearXNG container and local gateway were restored.
- A direct authenticated request to the local gateway through the newly created Quick Tunnel returned HTTP 200 with 15 results.
- A request to the deployed public Edge Function without a user session reached the function but returned HTTP 502 because the function's configured `SEARXNG_GATEWAY_URL` had not yet been changed to the newly created Quick Tunnel hostname.
- The current Quick Tunnel address is temporary and changes when the tunnel is recreated. Update the Supabase Edge Function secret `SEARXNG_GATEWAY_URL` to the current tunnel hostname before considering live cloud search fully restored.
- Magic-link request and verification events were present in Supabase logs, but the new same-frame redirect has not yet been tested end to end after adding the preview URL to the Redirect URLs allow-list.

## Public-source hygiene

- Historical schema drift was archived outside the active Supabase migrations folder.
- Private school resource references, exact local account paths, and temporary tunnel hostnames were removed from committed public source.
- The SearXNG gateway token remains server-side and is not checked in or exposed in browser code.
- User profile information, grades, rank, activities, essays, recommendation notes, and application workspace data remain local by default.

## Remaining verification

1. Update the Supabase `SEARXNG_GATEWAY_URL` secret to the currently active Quick Tunnel hostname.
2. Add `https://bundler.sandbox.animaapp.ai/**` to Supabase Auth Redirect URLs.
3. Send one fresh magic link, open it in the same browser profile, and confirm the app shows the signed-in account.
4. Call live search from a signed-out browser and verify results return from the public Edge Function.
5. Test cloud save/reload while signed in and confirm RLS isolation across two accounts.
6. Add a persistent distributed request limiter and CAPTCHA before high-volume public use.
