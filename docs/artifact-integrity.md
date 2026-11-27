# Canonical artifact integrity and freshness

## Product source of truth

The canonical product source of truth for Scholarship Scout is the existing AgentGrid artifact:

https://app.agentgrid.io/artifacts/Y9kTsZ0-vazOq3AnWspbAw

This identity is intentionally stable. Continue editing this artifact; do not create a duplicate artifact or treat a local orchestration repository, exported copy, preview, or deployment as the canonical product source.

## Resolving the current revision

The latest committed revision is the current main commit reported by AgentGrid, not a SHA copied into documentation or retained from an earlier task.

For each inspection or change:

1. Call AgentGrid artifact-explore on the canonical artifact and inspect its latest history/head.
2. Record the exact revision returned by that current inspection.
3. Read the required files at that revision before deciding whether a change is needed.
4. For an approved source edit, pass that exact revision as artifact-edit's baseRevision. A revision conflict means stop, re-inspect the new head, and reconcile rather than overwriting.
5. After a commit, use the revision returned by artifact-edit, then re-inspect the artifact to confirm the new head and changed paths.

Do not pin a commit hash in this policy. A pinned hash becomes stale as soon as another valid commit lands. Freshness is established by resolving the current head from AgentGrid history when the check is performed.

## Distinguishing product source from runtime services

Vercel deployments are runtime outputs, not the canonical source. A READY deployment does not prove that it was built from the current AgentGrid revision unless trustworthy build provenance links the deployment to that exact source revision.

Supabase is a backend dependency, not the canonical frontend/product source. Its project state, Edge Function versions, and database state must be checked separately when the task requires runtime verification. Do not infer source freshness from backend availability.

A deployment or backend check must never silently replace the canonical artifact identity.

## Integrity checklist

A source-of-truth check is complete only when all applicable statements are evidenced:

- The canonical AgentGrid artifact can be identified by the stable URL above.
- AgentGrid history identifies the latest committed revision at the time of inspection.
- The files reviewed or edited are read at that exact revision.
- Any artifact edit uses the exact inspected revision as baseRevision.
- The resulting revision and changed paths are recorded.
- Runtime deployment provenance is described separately; an unlinked or older deployment is not presented as current-source verification.

The artifact history and revision returned by AgentGrid are authoritative for source freshness. Documentation and prior task reports are historical records, not substitutes for a fresh head inspection.
