# Repository integrity and release freshness

## Source of truth

The only source of truth for Scholarship Scout application code is the GitHub repository:

https://github.com/randynlinda4ever-dot/scholarship-scout

The `main` branch is the canonical production source branch. Do not maintain or synchronize a second copy of the application in an external authoring platform.

## Review procedure

For every change:

1. Fetch the latest `origin/main` and record its full commit SHA.
2. Create a focused branch from that exact base.
3. Review the changed file list and diff for unintended edits, deletions, secrets, or student data.
4. Run the repository's required tests, type check, production build, and dependency audit.
5. Open a pull request targeting `main`; verify the PR head has not changed before merge.
6. After merge, verify the resulting `main` commit and the production deployment's Git SHA.
7. Verify the production domain and backend services separately when they are within the task scope.

Never infer deployment freshness from a deployment's READY state alone. The deployment's Git commit must match the intended merged commit.

## Backend boundaries

Supabase is a runtime dependency, not a source-of-truth repository. Verify its project state, deployed Edge Function versions and source, secrets configuration (without reading secret values), database schema, and RLS policies independently. A frontend deployment does not deploy Supabase changes.

## Integrity checklist

- The GitHub repository and target branch are identified.
- The working tree is understood before any edits.
- The pull request contains only the intended files and preserves unrelated work.
- Required CI checks pass against the exact PR head.
- The merge commit is verified on `main`.
- Production deployment provenance matches the merge commit.
- Any required Supabase/backend deployment is verified separately.
