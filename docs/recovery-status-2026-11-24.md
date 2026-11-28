# Apex Scholarship recovery status — November 24, 2026

## Executive status

**Overall status: PARTIAL — Apex remains paused.**

This report records the manual recovery investigation. It does not authorize or describe a restart of Apex agents, scheduled development cycles, or autonomous execution.

The application has a reproducible local test/build path and a recovered local Git checkpoint. Scholarship Scout's live discovery integration is still blocked, and the production frontend cannot be tied to the current canonical source revision.

## 1. Source of truth and local checkpoint

- Canonical repository: https://github.com/randynlinda4ever-dot/scholarship-scout
- Application source revision tested: `1701debbcf0a09beb643d0497bb4f4a6aac0ec34`
- Local workspace: `C:\Users\levih\Projects\ScholarshipScout-SC018-9f2720d`
- Recorded original local baseline: `9f2720d9f5f242c3b4e477222fd8e99e7e448929`
- Local Git branch: `main`
- Local application-source checkpoint commit: `dc606b0e37a86c34b08a46dfcaca24acede95f23`
- Local GitHub remote: none
- Initial application-source snapshot: 144 canonical files
- A later documentation-only commit added the recovery report and updated four documentation files; the latest local tree tracks 145 canonical files.
- Local working tree after the documentation checkpoint: clean

The historical GitHub revision history from the recorded baseline to the tested source revision contained three commits affecting six unique files: five regression-test files and `src/lib/evidence.d.ts`. Those changes were synchronized. The changed test files, the declaration, `src/lib/evidence.js`, `package.json`, the shared discovery module, `tests/eligibility.test.mjs`, and `package-lock.json` were compared against the GitHub source at that time.

**Provenance limitation:** the local workspace originally had no `.git` metadata. The `9f2720d` baseline came from its existing verification record and could not be independently proven from Git history. The new local commit is a recoverable snapshot, not a clone or Git commit equivalent of the recorded historical source revision.

### Repository hygiene repair

The canonical `.gitignore` contained literal backslash-n sequences, so its ignore patterns were not separate rules. It has been repaired in the GitHub source and local workspace. Verification with `git check-ignore` confirmed that `dist/`, `node_modules/`, and `*.log` are now ignored. Local-only verification files are excluded through `.git/info/exclude`.

## 2. Reproducible local verification

Environment:

| Component | Observed value |
| --- | --- |
| Node.js | `v26.13.0` |
| npm | `11.20.0` |
| Required Node engine | `>=22.12.0` |
| Package | `scholarship-scout@0.7.0` |
| Lockfile format | npm lockfile v3 |

A clean dependency installation was performed after the local Git checkpoint.

| Check | Result |
| --- | --- |
| `npm ci` | PASS — exit 0 |
| `npm audit --audit-level=moderate` | PASS — 0 vulnerabilities |
| `npm test` | PASS — 313 passed, 0 failed, 0 skipped |
| Test duration | 2,481.8 ms |
| `npm run build` | PASS — TypeScript and Vite |
| Vite output | 83 modules transformed |

The production build emits a non-fatal warning: the main JavaScript chunk is 536.70 kB, above Vite's 500 kB warning threshold. This is a performance follow-up, not a build failure.

The repository CI workflow specifies Node.js 22.16.0, `npm ci`, `npm audit`, `npm test`, and `npm run build`. The local run used Node.js 26.13.0. The workflow has not been executed because no matching accessible GitHub repository was found.

## 3. Supabase and database

- Project `scholarship-scout` is `ACTIVE_HEALTHY`.
- Database: PostgreSQL 17.11.
- Applied migrations: `initial_scholarship_scout_schema` and `restrict_anon_privileges_existing_tables`.
- Four public application tables were inspected; all have RLS enabled.
- Each table has an authenticated-user ownership policy. No anonymous-user policy was found in the inspected public policies.
- The inspected tables contained zero rows at the time of review.
- Health advisors returned no findings.

### Edge Functions

- `scholarship-discover`: ACTIVE, version 9, `verify_jwt=false` by design for public discovery.
- `scholarship-verify`: not deployed. The checked-in placeholder is explicitly disabled, and the browser API reports that sponsor verification is not deployed.

A live HTTP smoke test confirmed:
- GET returns 405 Method Not Allowed.
- OPTIONS preflight returns 200.
- A synthetic Texas / 2027 / general-category discovery request returned HTTP 502.
- The function reported 4 requested upstream queries, 0 successful queries, 4 failed queries, and 0 results.

This proves the function is reachable, but does **not** prove live scholarship discovery works.

### Live discovery blocker

The checked-in gateway documentation requires a local SearXNG service, an authenticated Node gateway, and Cloudflare Tunnel. Read-only inspection of the authorized Windows computer found:

- Docker Desktop service stopped.
- No running `cloudflared` process.
- No SearXNG process.
- No listeners on ports 8787 (gateway) or 8888 (SearXNG).
- The local gateway program and tunnel configuration files exist.

The available Supabase integration does not expose secret values, so the configured `SEARXNG_GATEWAY_URL` cannot be compared with the current local tunnel URL. A stale tunnel URL remains possible, but is not proven.

**No local services were started or restarted.** The gateway and live discovery remain blocked pending explicit authorization to resume the required local services.

### Supabase advisor findings

- Security warning: leaked-password protection is disabled. No Auth setting was changed.
- Performance information: two foreign keys lack covering indexes.
- Performance information: two indexes were reported unused.
- No health advisor findings.

These are follow-up review items, not proof of an exploitable vulnerability.

## 4. Vercel and GitHub

### Vercel

- Project: `scholarship-scout-standalone`.
- Project metadata reports `live=false`.
- Latest production deployment state: READY.
- Deployment created: November 10, 2026, 19:02:41 UTC.
- Both the production alias and deployment-specific URL returned HTTP 200.
- The deployment has no verified Git source/commit provenance.
- The production HTML references different hashed JS/CSS assets from the local build produced on November 23.

The site is reachable, but its current source revision is unverified. HTTP 200 and READY do not establish that the deployed app corresponds to the tested artifact. No deployment was performed.

### GitHub

The connected GitHub repository listing returned zero accessible repositories. Search results returned unrelated public projects without write permission. No matching repository or CI run could be established. The local recovery commit has not been pushed.

## 5. Browser verification

The connected Browser tool could not access a browser tab because this conversation did not originate in its connected browser context. The HTTP checks establish that the Vercel aliases return HTML, but they do not replace browser testing.

Not yet verified in a real browser:
- App hydration and runtime console.
- Navigation and forms.
- Search and filtering.
- Empty/error states.
- Responsive layout.
- Signed-in and signed-out behavior.
- Live discovery results.

## 6. Current blockers and next actions

1. **Live discovery:** after explicit authorization to resume local services, start and validate Docker/SearXNG, the Node gateway, and Cloudflare Tunnel; then compare the current tunnel URL with the Supabase secret without exposing the token.
2. **Live discovery:** run one controlled synthetic end-to-end search and require valid results or a clear, actionable error.
3. **GitHub:** identify the correct repository or authorize creation of one; connect the existing CI workflow and verify the tested commit.
4. **Vercel:** establish the exact source revision behind the deployment; only redeploy after the source/CI checks and separate deployment authorization.
5. **Browser:** perform real-browser acceptance tests after a verified deployment is available.
6. **Security:** review leaked-password protection and the advisor findings; do not change production Auth or database settings without a separate decision.
7. **Performance:** evaluate code splitting for the 536.70 kB main JavaScript chunk.

## 7. Pause and change-control record

During this recovery pass:

- No Apex agents were dispatched.
- No scheduled tasks or recursive development cycles were restarted.
- No Supabase migrations were applied.
- No Supabase Auth settings or secrets were changed.
- No Edge Function was redeployed.
- No Vercel deployment was created or promoted.
- No GitHub repository was created or pushed to.

**Completion classification:** local source checkpoint and clean-install verification are complete; live discovery, production provenance, browser acceptance, and Apex autonomous-system acceptance remain incomplete or blocked.
