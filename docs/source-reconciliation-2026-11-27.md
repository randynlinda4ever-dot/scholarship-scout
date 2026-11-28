# Source and release reconciliation — November 27, 2026

## Current source policy

GitHub repository `randynlinda4ever-dot/scholarship-scout`, branch `main`, is the only canonical source of Scholarship Scout application code. All application changes, source history, reviews, and releases must be represented in this repository. No external authoring copy or synchronization workflow is used.

Vercel is the frontend hosting and deployment platform. Supabase provides authentication, database, and Edge Function runtime services. These runtime services are verified independently; a frontend deployment does not deploy Supabase code or alter database settings.

## Why this archived report exists

This report preserves the November 27, 2026 source and runtime comparison. Its revision identifiers and implementation differences are historical evidence only. They are not instructions to consult, restore, or synchronize another repository or authoring system.

At the time of the comparison, two independently maintained source copies had diverged. The GitHub implementation contained country-aware profile fields, broader retry-after parsing, application UI changes, and additional tests that were already used by the GitHub test suite. Those capabilities were retained in the GitHub application. Whole-file replacement from the compared copy was rejected where the source was incomplete or the implementation was narrower.

## Historical release facts

- The active application entry point was `src/App.tsx`; the modular page/component files in `preserved-github-work/` were retained but were not wired into the runtime.
- Supabase `scholarship-discover` was reported ACTIVE at version 19 during the runtime inspection. A later SC-246 report records a separate subsequent version-16 deployment; consult the dated Supabase runtime evidence rather than assuming one historical version applies to every point in time.
- The selected discovery design used an in-memory per-isolate IP limiter and the authenticated gateway's process-wide request ceiling. Redis/Upstash was not required for that single-gateway configuration.
- The live Edge Function source and the reviewed repository wrapper were not byte-identical at the time of the report. Backend source parity required a separate review and deployment.
- Student profiles, academic records, essays, application notes, and eligibility data remained local by default. The discovery request boundary remained limited to state, graduation year, and selected category IDs.

## Release procedure now in force

1. Fetch `origin/main` and branch from its exact commit.
2. Make a focused change and inspect every changed file and deletion.
3. Run `npm ci`, `npm test`, `npm run build`, and `npm audit --audit-level=moderate`.
4. Open a pull request targeting `main` and verify CI against the exact PR head.
5. Merge only the reviewed PR and record the merge commit.
6. Verify the Vercel production deployment was built from that exact merge commit.
7. Verify Supabase Edge Function versions, source, secret configuration, RLS, and any backend smoke tests separately when backend behavior is in scope.

Never infer source parity from a deployment status or matching version number. Never expose secret values or place student-specific information in public discovery requests.
