# Phase 5 — Performance and Technical Debt Review

**Date:** November 28, 2026
**Branch:** `phase4/architecture-simplification-20261128`
**Base revision:** `89ee99fd5ef154a6ae23f3a87c8e3592df32b30e`
**Scope:** Local source inspection and production build; no deployment or live database mutation.

## Executive summary

Phase 5 retained only low-risk, evidence-backed cleanup. The repository already has a small dependency surface and an explicit lazy startup path. The build succeeds, the production dependency audit reports no vulnerabilities, and no package upgrade was needed. No speculative React memoization, caching, query/index changes, or bundle-splitting changes were introduced because the available evidence does not demonstrate that they would improve real user performance without adding correctness or maintenance risk.

## Performance baseline

| Measurement | Observed result | Notes |
|---|---:|---|
| Modules transformed | 117 | Vite production build |
| Vite-reported build time | 340 ms | Bundler phase only |
| Full `npm run build` elapsed | 6.82 s | Includes TypeScript no-emit check and process overhead |
| Largest JavaScript asset | 256.1 KB / 67.95 KB gzip | App chunk |
| Second-largest JavaScript asset | 216.0 KB / 55.68 KB gzip | Shared generated chunk |
| Third-largest JavaScript asset | 132.7 KB / 43.07 KB gzip | Shared client chunk |
| Total emitted JavaScript | ~763.6 KB / ~218.6 KB gzip | Sum of emitted JS assets in this build |
| Total emitted CSS | ~118.3 KB / ~22.5 KB gzip | Sum of emitted CSS assets in this build |

These are local build-artifact measurements, not network-transfer timings or Core Web Vitals. No prior Phase 4 bundle artifact or reproducible browser performance trace was available for a before/after comparison. Therefore no percentage improvement is claimed.

## Findings

### React rendering and computation

- `src/App.tsx` remains the largest UI module at approximately 2,221 lines and contains many hooks and render-time operations. This makes it the primary candidate for future profiling.
- Static hook/collection-operation counts are not render counts. Without React Profiler traces and representative interactions, adding `memo`, `useMemo`, or `useCallback` would be guesswork and could increase complexity or preserve stale values.
- The bootstrap path dynamically imports React, the account gate, and the application only when needed. The legal acceptance gate precedes workspace startup; the main application is not eagerly loaded at initial entry.
- No code-level rendering optimization was justified by the available measurements.

### Requests, search, and database

- Source inspection confirms the discovery request contract remains limited to state, graduation year, and selected category IDs. The server-side gateway remains the upstream boundary.
- The discovery pipeline and scholarship API have dedicated modules; there was no evidence from local source inspection alone of duplicate live requests, a network waterfall, or an inefficient pagination regression.
- No production request traces, database query plans, table cardinalities, or representative EXPLAIN ANALYZE results were available. No index or query change was made.
- Search ranking, category coverage, pagination behavior, eligibility comparisons, and source verification were left unchanged.

### Bundle

- The application is lazy-loaded after the legal gate, and Vite already emits multiple chunks.
- The main app chunk is approximately 256 KB raw / 68 KB gzip. Other large chunks are shared generated/client assets. Their exact ownership and loading criticality require a bundle visualization or browser network trace before changing chunk boundaries.
- No new bundle-analysis dependency was added.

### Background work and caching

- No evidence justified adding cache layers, prefetching, workers, or background jobs. These can increase stale-data risk, resource use, and invalidation complexity.
- Existing discovery/cache/retry behavior was left unchanged to protect search reliability.

## Dependency review

- Production dependencies: `@supabase/supabase-js`, `react`, `react-dom`.
- Development dependencies: `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `typescript`, `vite`.
- `npm ls --depth=0` showed the declared dependencies installed without missing or invalid top-level packages.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- The current package set contains no obvious unused top-level dependency from the inspected entrypoints and configuration. No package removal was justified.
- `npm outdated` identified patch releases for Supabase JS and Vite, plus major-version releases for React, React types, and TypeScript. No upgrade was made: the audit found no vulnerability, the current versions satisfy the project runtime, and upgrades would add compatibility/testing work without a demonstrated performance or security gain.
- `package.json` and `package-lock.json` were intentionally left unchanged.

## Configuration cleanup

- Confirmed the only build-time browser configuration values explicitly exposed by `vite.config.ts` are the Supabase project URL and publishable key. Service-role keys and gateway tokens are not included in the client define object.
- Confirmed Node is pinned to 26.13.0 in `.nvmrc` and constrained to Node 26 in `package.json`.
- The package scripts are all directly useful (`dev`, `build`, `preview`, `test)); no unused script was removed.
- Removed obsolete commented Upstash limiter placeholders from `.env.example`. The active limiter design does not use Upstash; the example now documents only active browser-build configuration and the privacy boundary.
- TypeScript strictness and unused-symbol checks were retained. Vercel rewrites and response headers were not simplified because they encode distinct routing and security behavior.

## Documentation changes

- Updated `docs/architecture.md` to distinguish the active local, uncommitted Phase 4 working tree from deployed release state and reflect the reviewed discovery function version.
- Updated the current verification summary in `docs/testing.md` to reflect the 866/0/0 Phase 4 test result, current local build/audit evidence, and the explicit limits of those checks. Historical work-item records remain historical.
- Removed stale unused Upstash environment placeholders from `.env.example`.
- Added this report as the Phase 5 evidence record.

## Before/after and retained changes

| Area | Before | After |
|---|---|---|
| Build output | Baseline captured in this phase | No code bundle change; same build artifacts |
| Build time | 6.82 s full command; 340 ms Vite phase | No optimization claimed |
| Production dependency audit | 0 vulnerabilities | 0 vulnerabilities; no dependency change |
| Package manifest / lockfile | Existing versions | Unchanged |
| Environment example | Included inactive Upstash setup comments | Inactive comments removed |
| Architecture/testing docs | Stale release/test summary text | Current local verification and release-boundary notes |

The only measured performance values are the baseline values above. Documentation/configuration cleanup does not change runtime behavior; it is not presented as a performance gain.

## Remaining optimization opportunities

1. Capture React Profiler traces for startup, editing a profile, filtering the tracker, and running discovery. Optimize only repeatable expensive commits or derived computations.
2. Capture browser network traces for cold start, signed-out discovery, signed-in cloud sync, and pagination. Record request counts, payload sizes, waterfall timing, and cache behavior.
3. Profile search normalization/ranking with representative large result sets before changing algorithms or pagination.
4. Obtain database query plans and realistic row counts before proposing indexes. Confirm existing index coverage and write amplification before adding any.
5. Generate a bundle analyzer report or browser coverage trace to attribute the 216 KB and 133 KB chunks and identify genuinely unused shipped code.
6. Revisit dependency updates only when supported by security advisories, compatibility requirements, or measured build/runtime benefits.

## Verification and scope

- `npm run build`: passed; TypeScript check and Vite production build completed.
- `npm audit --omit=dev`: passed; zero vulnerabilities.
- Latest full test evidence carried forward from Phase 4: `npm test` **866 passed, 0 failed, 0 skipped**. No application behavior changed in Phase 5; the full suite was not rerun for documentation-only changes.
- No live API load test, database EXPLAIN, browser trace, deployment, Supabase mutation, or dependency upgrade was performed.
- Existing Phase 2–4 working-tree changes were preserved. No commit or push was made.

**Conclusion:** Phase 5 removed stale configuration/documentation, recorded a reproducible local performance baseline, and avoided unproven optimizations. Functional behavior, privacy boundaries, search accuracy, and eligibility correctness remain unchanged.
