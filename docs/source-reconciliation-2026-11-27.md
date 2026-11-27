# Scholarship Scout source reconciliation and architecture decisions

**Audit date:** November 27, 2026  
**Status:** Reconciliation decisions recorded. This branch preserves both sources' work; runtime tests and a deployment are separate later gates.  
**Scope:** AgentGrid canonical source, GitHub release mirror, frontend activation, Supabase discovery runtime. No production, database, Edge Function, secret, or auth changes were made.

## Exact source coordinates

| System | Exact reference | Meaning |
|---|---|---|
| AgentGrid artifact | `Y9kTsZ0-vazOq3AnWspbAw` | Canonical authoring source |
| AgentGrid HEAD inspected | `336ed785daedcf4ba02650d79786545bee6a2edf` | Latest committed artifact revision at audit time |
| GitHub reconciliation base | `6147370a94499a69ef47dd9fee0677e0cd3abec3` | Existing release branch/main head at audit time |
| GitHub working branch | `release/reconciliation-2026-11-27` | New branch created from the exact base above |
| Supabase project | `wjrwvempgjvoxlioodse` | Existing backend |
| Supabase discovery function | `scholarship-discover`, version 19 | Active public discovery endpoint at audit time |

The GitHub reconciliation branch was created and pushed from commit `6147370a94499a69ef47dd9fee0677e0cd3abec3`. The existing release branch and main were not changed. The local working tree was clean, and the local checkout is now on the dedicated reconciliation branch. No application source was overwritten during branch creation.

## Intended architecture

### Source and deployment roles

1. AgentGrid is the canonical authoring source.
2. GitHub is the collaboration and reviewed release mirror. It is not automatically synchronized with AgentGrid; every merge must be explicit and attributable to a commit.
3. Vercel is the production frontend hosting and deployment target for `scholarship-scout.org` and `www.scholarship-scout.org`. It is not a source of truth. The deployed frontend commit must be compared with the exact GitHub release commit and AgentGrid revision.
4. Supabase is the backend for optional authentication, owner-scoped cloud sponsor records, public discovery, and account deletion. A successful frontend deployment does not establish Edge Function source parity.

### Legal acceptance and age gate

The active entry path is `src/main.tsx`. It renders `LegalAcceptanceGate` first and lazy-loads `App` only after a current legal acceptance is stored and verified. Acceptance requires the notice to be read to the end and the user to affirm agreement. The gate accepts adults (18+); for ages 13–17 it requires a separate parent/legal-guardian authorization checkbox; it blocks under-13 users from continuing. The age band and guardian selection are stored locally. The gate explicitly does not verify age or guardian identity. Preserve that limitation in all user-facing claims.

### Frontend runtime and preserved modularization

The active workspace in the GitHub release branch is still the monolithic `src/App.tsx`; `src/main.tsx` lazy-loads it after the legal gate. The active stylesheet is `src/App.css`.

The GitHub repository also contains a modular workspace refactor:
- `src/features/workspace/pages/` contains seven page components.
- `src/features/workspace/pageTypes.ts` contains explicit page contracts.
- `src/components/ScholarshipCards.tsx`, `StatusPills.tsx`, and `WorkspaceFields.tsx` contain shared UI.
- `src/domain/types.ts` contains shared domain types.
- `src/styles/` contains split style modules.
- `preserved-github-work/` contains retained contributor helpers and a test for that alternate page-module architecture.

Those files are **preserved but not active in the current runtime**. The inspected `src/App.tsx` does not import or render the page modules; `src/main.tsx` lazy-loads `App`, not a module-based workspace renderer. `docs/frontend-module-architecture.md` previously described the refactor as already active; its new status note now distinguishes preserved work from the running application. Keep these contributions and their history. Do not wire them into the runtime or delete them during source synchronization until feature parity and module-specific tests are demonstrated.

### Data ownership and privacy boundary

- The student's profile, age, school and academic details, activities, interests, essays, recommendation information, eligibility assessments, local tracker, and application-preparation workspace remain in the browser's encrypted local vault by default.
- Supabase Auth is optional for public discovery. Cloud sponsor-record CRUD requires an authenticated user and remains owner-scoped through RLS.
- Public `scholarship-discover` is intentionally callable without a user JWT. The browser request may contain only broad state, expected graduation year, and selected generic discovery category IDs.
- Never send name, email, school/district identifiers, GPA, class rank, scores, activities, contact details, essays, application data, or the full student profile in discovery requests.
- The Edge Function uses server-side gateway configuration and returns unverified scholarship leads. Sponsor identity, awards, deadlines, and eligibility must not be invented or treated as verified.
- `account-delete` is active with JWT verification enabled. The source `scholarship-verify` function has `LIVE_VERIFICATION_ENABLED = false` and is not present in the current deployed function inventory. Do not enable sponsor extraction without separate review.

## Backend: current runtime versus canonical source

Supabase currently reports:
- `scholarship-discover`: ACTIVE, version 19, `verify_jwt=false`.
- `account-delete`: ACTIVE, version 2, `verify_jwt=true`.
- `scholarship-verify`: not present in the deployed function inventory.

The deployed discovery entrypoint imports and injects `createPublicRateLimiter()` from `_shared/scholarship-discovery.mjs`. That is an in-memory, per-isolate limiter. Its deployed helper also contains an Upstash implementation, but the entrypoint does not wire it. The deployed entrypoint comment says the authenticated gateway enforces an additional process-wide upstream request ceiling; that gateway control was not independently verified in this audit.

The current AgentGrid and GitHub source entrypoint instead imports `createUpstashRateLimiter` and `getDiscoveryRateLimitConfig` from `supabase/functions/_shared/discovery-rate-limit.mjs`. It uses Redis-backed client/IP quotas and concurrency leases and intentionally fails closed with HTTP 503 when shared storage is unavailable. It requires server-side `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The presence and validity of those secrets have not been verified.

**The rate-limiter architecture remains an explicit unresolved decision.** No Upstash wrapper deployment was performed. Choose between:
- Retaining the in-memory per-isolate limiter with verified gateway-wide limits, while documenting the limits of per-isolate enforcement; or
- Adopting the distributed Upstash limiter after verifying both secrets, cost/availability, source parity, 429/503 behavior, and a tested rollback package.

Do not silently substitute one implementation for the other, do not weaken fail-closed behavior, and do not deploy the Upstash wrapper while its required secrets are unverified. Never expose secret values in source, logs, or chat.

## File-level reconciliation

The AgentGrid tree contained 256 files and the GitHub release tree contained 278 files at inspection. There were 254 shared paths, two AgentGrid-only paths, and 24 GitHub-only paths. This is a path comparison, not a claim that every shared file is identical.

### Shared files confirmed identical

The following important shared files were read from both sources and matched byte-for-byte:
- `src/lib/applicationProgress.js`
- `src/lib/applicationWorkspace.js`
- `src/lib/trackerManagement.js`
- `src/lib/evidence.js`
- `src/lib/profileReadiness.js`
- `src/lib/backup.js`
- `src/lib/manualSearchQueries.js`
- `src/lib/discoveryErrors.d.ts`
- `src/lib/manualSearchQueries.d.ts`
- `src/lib/trackerManagement.d.ts`
- `supabase/functions/_shared/discovery-rate-limit.mjs`
- `supabase/functions/_shared/scholarship-discovery.mjs`
- `supabase/functions/scholarship-discover/index.ts`
- `tests/discoveryRateLimit.test.mjs`
- `tests/discoveryErrors.test.mjs`
- `tests/urlSanitizationEncoding.test.mjs`

This confirms that the current Upstash implementation and its wrapper are already present on the GitHub branch as well as AgentGrid. It does **not** mean that those files are deployed to Supabase.

### Intentional GitHub differences to preserve

- `src/lib/profileValidation.js`: GitHub has country-aware validation for residence, school, and intended-college locations; AgentGrid's current variant is narrower. GitHub's `src/lib/profileLocations.js`, country/state controls in the active app, and `tests/profileLocations.test.mjs` are additional working product capabilities. Keep them; do not replace them with the narrower AgentGrid copies.
- `src/lib/discoveryErrors.js`: GitHub safely parses a wider bounded `Retry-After` value and clamps it; keep that implementation rather than overwriting it with the narrower AgentGrid expression.
- `src/legal/terms.ts`: the wording differs slightly. Keep the GitHub copy's more explicit explanation of the permanent Settings account-deletion workflow.
- `src/App.tsx`: the GitHub version contains the country-aware profile fields and additional UI already relied on by the GitHub tests. AgentGrid's artifact read was truncated by the artifact reader's content limit, and its App file is not a safe whole-file replacement. Preserve the GitHub app and reconcile individual behavior changes only after a focused diff.
- GitHub-only modular page components, types, styles, preservation helpers, and tests remain retained. They are not safe to remove or wholesale replace.

### AgentGrid-only test files not copied

AgentGrid currently has:
- `tests/crossPageConsistency.test.mjs`
- `tests/obsoleteEnrollmentControl.test.mjs`

These were not copied as duplicate tests. GitHub already has `tests/obsoleteUiCompatibility.test.mjs`, which covers the cross-page consistency behaviors, checks that the old full-time enrollment control is absent, verifies the accepted enrollment alternatives, and preserves legacy eligibility evaluation. The current GitHub App already contains the accepted-enrollment heading and status handlers. No additional behavior change was required for this control.

## Documentation synchronization completed on this branch

This reconciliation branch records the actual frontend activation state, age/guardian gate behavior, current Supabase limiter mismatch, source boundaries, and file-level merge decisions. The frontend architecture document now explicitly marks the module refactor as preserved/unintegrated. Agent instructions now identify Vercel as the hosting/deployment target rather than saying it is not a deploy target. The testing status now references the exact AgentGrid HEAD and states that current full checks remain unrun.

## Validation and remaining release work

This reconciliation pass did not run `npm ci`, `npm test`, `npm run build`, `npm audit`, or real-browser workflows. No claim of test/build success is made. It also did not deploy Vercel or Supabase, read or change secrets, change RLS, or touch production data.

After the source reconciliation is reviewed, validate the exact commit on this branch. Then test the legal/age gate, local-vault behavior, discovery request privacy boundary, public discovery, sign-in and account deletion, and owner-scoped cloud access in a browser. Keep Supabase backend source parity and the rate-limiter choice as a separate gate. Production publishing can wait until the release candidate is explicitly accepted.
