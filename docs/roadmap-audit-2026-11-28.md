# Roadmap audit — November 28, 2026

**Review timezone:** America/Chicago. The last external scan and deployment checks occurred after midnight UTC on November 28, which was still November 27 in Central Time.

**Repository:** `randynlinda4ever-dot/scholarship-scout`

**Reviewed `main`:** `92cd7387547eceef8977e6d03c887cdfcf2a7c96`

**Production deployment:** Vercel `dpl_76eQ6MdWSHbgAskmkUeiqKmL1L2h`, READY for that exact commit

**Supabase project:** `wjrwvempgjvoxlioodse`, ACTIVE_HEALTHY, PostgreSQL 17.11

## Executive result

The November 27 roadmap baseline was stale. It pointed to commit `ae35778` and described the Resources workspace as unmerged local work, while current `main` and production now include that feature, the subsequent authentication/legal fixes, and the RFC 9727 API catalog.

The roadmap now uses the current main commit and deployment as its baseline. It distinguishes shipped frontend features from open catalog/editorial work and separates verified discovery-function source parity from the remaining account-deletion source mismatch. This was a read-only status audit apart from documentation changes to the roadmap, its companion audit, and the documentation index. No application code, Supabase function, database, Auth setting, secret, or production configuration was changed.

## Release security recheck — November 28, 2026

This read-only recheck supersedes the earlier function-version and default-privilege findings below where they conflict. The project remains ACTIVE_HEALTHY on PostgreSQL 17.11.

| Function | Current live state | Verification |
|---|---|---|
| `scholarship-discover` | ACTIVE v28, `verify_jwt=false` | Public discovery only; the payload remains state, graduation year, and selected category IDs |
| `account-delete` | ACTIVE v4, `verify_jwt=true` | Deployed bundle contains `readBoundedJsonBody(request, 2048)` and its shared helper; no destructive deletion was tested |

The current `public` inventory contains five tables, all with RLS enabled. `student_profiles` and `eligibility_checks` have no direct `anon` or `authenticated` SELECT/INSERT/UPDATE/DELETE grants; `service_role` retains server-side access. The authenticated grants on `scholarships`, `scholarship_sources`, and `account_vault_backups` remain protected by owner-scoped RLS policies.

The live `pg_default_acl` audit confirms that `postgres`-owned defaults in `public` do not grant table, sequence, or function privileges to `anon` or `authenticated`. Managed `supabase_admin` defaults still include API-role privileges, but the ownership query found zero current `public` tables, sequences, or functions owned by that role. Supabase documents that these internal defaults cannot be changed by customers and apply only to objects the internal role creates. The unsupported owner-scoped script and its script-specific test have been removed from PR #26. Keep extensions in `extensions` or another non-exposed schema and recheck after extension or platform changes. See [Supabase's managed default-privilege guidance](https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema-448af9).

The latest Vercel production deployment observed before this PR merge is READY for the existing `main` baseline, not for the PR candidate. The PR preview is separate; verify the exact merged commit and production aliases after merge.

## 1. Frontend release and product features

### Release provenance

- PR #9 merged the student Resources workspace.
- PR #10 merged the Auth PKCE persistence and mobile legal-gate changes.
- PR #11 refined the mobile Terms acceptance and conditional guardian acknowledgement.
- PR #12 published the RFC 9727 API catalog, OpenAPI 3.1 contract, and human-readable API docs.
- Current production deployment `dpl_76eQ6MdWSHbgAskmkUeiqKmL1L2h` is READY for `92cd7387547eceef8977e6d03c887cdfcf2a7c96`, with both the apex and www aliases.

### Verified shipped features

- My Scholarships tracker and public scholarship guide routes are present in the production release.
- `/resources` is a production route. The page contains five tools: the shared scholarship tracker, essay planning worksheet, financial-aid checklist and net-price comparison, scholarship-scam red-flag guide, and junior-to-senior preparation calendar.
- The Resources page is a toolkit, not a general resource catalog. Its worksheet/checklist/comparison/calendar state uses the local encrypted vault and is included in the version-3 encrypted backup contract; legacy version-1 and version-2 imports remain supported. Relevant tests include `resources.test.mjs`, `workspaceRoutes.test.mjs`, and backup tests.
- Mobile Terms acceptance was verified in production Chrome at 390×844, 360×640, and 320×568. The Continue action remained visible; no horizontal overflow was observed; guardian acknowledgement appeared only when the minor age group was selected.
- Production GET smoke checks returned HTTP 200 for `/`, `/resources`, `/scholarship-guides/`, `/scholarship-guides/high-school-juniors/`, `/scholarship-guides/texas-scholarships/`, `/api-docs.html`, `/api/openapi.json`, `/.well-known/api-catalog`, `/sitemap.xml`, and `/robots.txt`.

### Current frontend verification

On the exact current `main` checkout:

| Check | Result |
|---|---:|
| `npm test` | 794 passed, 0 failed, 0 skipped |
| `npm run build` | TypeScript check and Vite build passed |
| `npm audit --audit-level=moderate` | 0 vulnerabilities |
| `git diff --check` before the documentation edits | Passed |

PR #12's GitHub CI also passed dependency review, automated tests, and type-check/build on its exact PR head. The production deployment is READY for the resulting squash merge commit.

These checks do not complete the full real-browser workflow matrix. Cross-account RLS isolation, full magic-link/Google OAuth callbacks, local vault failure/recovery cases, backup restore in an actual browser, offline recovery, and spoken screen-reader testing still require explicit evidence.

## 2. RFC 9727 API catalog

Production `https://scholarship-scout.org/.well-known/api-catalog` returns HTTP 200 for GET and HEAD with:

- `Content-Type: application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"`
- `Link: <https://scholarship-scout.org/.well-known/api-catalog>; rel="api-catalog"`
- A JSON `linkset` with two API anchors.

The linked OpenAPI document and human-readable docs both return HTTP 200. The catalog lists the two active application-owned Edge Functions: `scholarship-discover` and `account-delete`. It does not advertise a status relation because neither function has a public health endpoint. The sponsor-verification function is a disabled, undeployed placeholder and is correctly excluded.

The requested external scan was POSTed to `https://isitagentready.com/api/scan` with `{"url":"https://scholarship-scout.org"}`. It returned HTTP 200 with:

- `checks.discovery.apiCatalog.status = "pass"`
- Message: `API Catalog found with 2 APIs listed`
- `apiCount = 2`, `linksetEntries = 2`, and `correctContentType = true`

This validates the API catalog check only. Other agent-discovery standards reported by that broader scanner are separate capabilities and were not part of the RFC 9727 task.

## 3. Live Supabase state

### Project and active functions

Supabase reports project `wjrwvempgjvoxlioodse` as ACTIVE_HEALTHY, in `us-east-1`, on PostgreSQL 17.11. The active function inventory contains:

| Function | State/version | JWT verification | Source status |
|---|---:|---:|---|
| `scholarship-discover` | ACTIVE v20 | `false` | All four deployed files match current GitHub source after newline normalization |
| `account-delete` | ACTIVE v2 | `true` | Deployed entrypoint differs from current GitHub source |

### Discovery source parity — verified

The deployed `scholarship-discover` v20 source bundle contains four files. Each was retrieved from Supabase, compared against the corresponding current `main` file after normalizing CRLF/LF line endings, and found identical:

| File | Normalized SHA-256 |
|---|---|
| `supabase/functions/scholarship-discover/index.ts` | `c9302613599f3e9f353a47d8fbecdf281d21e0b8b67cc2d1b56830cb99650577` |
| `supabase/functions/_shared/discovery-rate-limit.mjs` | `8f7ad81f98da2833b8809e35f40afad08ca0e81e1a8bbd087416f1be867ae419` |
| `supabase/functions/_shared/scholarship-discovery.mjs` | `1d653ddba99429a2735538471ae154529fecacb3561cd528733d33a5012c012f` |
| `supabase/functions/_shared/us-states.mjs` | `7d8a81276f4f880a404e0d779e96c862c79df7213a99c58cb92fc8c6520b7389` |

The v20 metadata hash is `e0fa8b216572a6fb107fc3d86073bd196732218c16cc0892ac594c605b5d598b`. The version and metadata hash are recorded separately from the per-file content hashes. Public discovery remains unauthenticated by design; this setting applies only to this function.

### Account-deletion source drift — still open

The deployed `account-delete` v2 entrypoint does not match the current repository source:

- Deployed normalized source SHA-256: `eb3b9a48d6f81cc881a674f210db1d678b8c275bcbb3d3f0b6257689a5364104`
- Current `main` normalized source SHA-256: `c06170c1cd8d0e6f8fd4865acd0ab07b31a45541773306dc52c170d0e4d1c445`

The deployed version checks the declared Content-Length and then calls `request.json()`. Current `main` uses the shared `readBoundedJsonBody(request, 2048)` stream reader and maps body-size errors explicitly. The deployed function still has `verify_jwt=true`, verifies the bearer token, derives the account ID from the verified user, revokes refresh sessions, and deletes that Auth user. Do not claim exact backend source parity until this v2 difference is reconciled through a separately reviewed deployment with preserved source and rollback evidence.

The active function inventory does not list `scholarship-verify`; the local source remains a disabled placeholder, not a deployed API.

## 4. Database, migrations, and security

The live migration inventory contains:

1. `20261110044744_initial_scholarship_scout_schema`
2. `20261111020458_restrict_anon_privileges_existing_tables`
3. `20261127052519_restrict_public_default_privileges_for_postgres`
4. `20261127182856_enforce_owner_scoped_relations_and_fk_indexes`
5. `20261127183308_optimize_owner_rls_auth_initplan`

The current public schema inventory contains `student_profiles`, `scholarship_sources`, `scholarships`, and `eligibility_checks`; all four have RLS enabled. The table-listing response reported zero rows in each at the time of this read-only check.

### Default privileges

A read-only query of `pg_default_acl` confirmed:

- For objects created by `postgres` in `public`, defaults grant the object owner and `service_role`, but no `anon` or `authenticated` default privileges. The postgres-owner restriction is working.
- For objects created by `supabase_admin` in `public`, default ACL entries still grant `anon` and `authenticated` broad table, sequence, and function privileges. This remains an owner-level security follow-up. It does not prove the four existing tables are currently unrestricted; all four currently report RLS enabled. It does mean future objects created under that owner can inherit broader access and need proper ownership/default-ACL handling plus RLS/policies.

### Current advisor results

- Security: WARN — leaked-password protection is disabled. The app currently uses magic-link and Google OAuth, not password authentication. Keep the warning tracked and enable the protection before adding password sign-in.
- Performance: INFO — three indexes were reported unused: `eligibility_checks_owner_checked_idx`, `scholarships_source_id_idx`, and `eligibility_checks_scholarship_id_idx`. Do not drop them based only on a low-volume/empty-table advisor snapshot; measure actual queries and growth first.
- Health: no advisor lints returned.

No database, RLS, grants, migration, Auth setting, or secret was changed during this audit.

## 5. Hosting headers and production checks

The production homepage HEAD response includes HSTS and the API-catalog Link header. It did not return a site-wide CSP, Referrer-Policy, Permissions-Policy, or X-Content-Type-Options header during the check. The catalog route itself does return `X-Content-Type-Options: nosniff`. Reconcile the site-wide response-header posture in Vercel/Cloudflare and validate the actual deployed headers; a CSP meta element does not replace an HTTP CSP with `frame-ancestors`.

## 6. Documentation drift

The roadmap is now current, but surrounding project documentation is not. Examples found on current `main` include:

- `README.md`, `AGENTS.md`, and `docs/architecture.md` still cite Node 22 in setup/runtime guidance even though `.nvmrc` is `26.13.0`, `package.json` requires Node `>=26 <27`, and CI uses Node 26.
- `README.md`, `docs/architecture.md`, `docs/discovery-system.md`, `docs/anonymous-access.md`, `docs/privacy-and-security.md`, `docs/testing.md`, `docs/deployment.md`, and `AGENTS.md` still describe Supabase discovery v19 or its earlier source-parity status.
- `README.md` still records an older 790-test result rather than the current 794-test baseline.
- Other dated audit and recovery documents contain earlier historical versions and should remain historical; update their indexes or current-summary sections rather than rewriting their evidence.

Four Dependabot PRs are open: #1 Supabase JS patch; #2 React DOM/types; #3 TypeScript 7 major; #4 React/types. Review independently, and isolate the TypeScript major upgrade from routine dependency patches.

## 7. Roadmap disposition

| Priority | Current disposition |
|---|---|
| P0.1 backend source alignment | Discovery v28 and account-delete v4 are active; synthetic live function failure-mode checks and a fresh discovery invocation remain incomplete. The deployed account-delete bundle has the bounded reader and JWT verification enabled. |
| P0.2 browser workflow matrix | Mobile Terms acceptance viewport checks are complete; full authentication, vault, backups, offline recovery, cross-account isolation, and screen-reader matrix remain open. |
| P0.3 security / operations | RLS, local-only table grants, and `postgres` defaults verified. Managed `supabase_admin` defaults remain but zero current `public` objects are owned by that role; extension placement/ownership is a preventive follow-up. Site-wide response-header verification and leaked-password protection remain open. |
| P0.4 release integrity | Current PR/CI/Preview/production process passed for the latest release; retain as a standing gate. |
| P1 Resources | Five-tool toolkit shipped; general curated resource catalog, bookmarks, review lifecycle, and ongoing link checks remain future work. |
| P1 discovery quality | Current adaptive retrieval is deployed, but benchmark judgments and relevance/freshness metrics remain necessary before further algorithm changes. |
| P2 documentation/runtime | Node 22 versus 26 and old v19 summaries remain in active docs; four dependency PRs need focused review. |
| P3 API/catalog expansion | RFC 9727 describes current app APIs; it is not a curated scholarship catalogue or public scholarship dataset. |

## Recommended next three actions

1. Verify the live HTTP security headers on the production apex and `www` hosts after the Vercel PR merge; source configuration alone is not proof of deployed headers.
2. Keep future extensions in `extensions` or another non-exposed schema and re-audit `supabase_admin` object ownership after extension or platform changes; do not attempt to alter managed-role defaults.
3. Complete the remaining real-browser release matrix and reconcile the active README/AGENTS/runtime docs; review Dependabot PRs #1–#4 independently.
