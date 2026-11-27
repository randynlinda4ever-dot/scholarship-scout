# Deployment and release controls

> **Current deployment status — November 25, 2026:** Supabase is ACTIVE_HEALTHY and `scholarship-discover` is ACTIVE at version 10, inline source hash `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`. The latest inspected traffic window contains only version-9 HTTP 502 requests; no fresh version-10 synthetic request was observed. Vercel provenance remains a separate unverified gate. Do not infer deployment correctness from READY or HTTP 200 alone. See [the consolidated SC-246 report](sc246-gateway-recovery-2026-11-25.md).

## Environments

The current artifact is developed through the AgentGrid artifact/editor. Supabase project ref is wjrwvempgjvoxlioodse. No production deployment or database migration was performed in the current implementation pass.

## Current backend deployment

- `scholarship-discover` is ACTIVE at version 10, with `verify_jwt=false` for this function only to permit public discovery. Its inspected inline source hash is `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`.
- The latest inspected function-edge log window contained seven POST 502 requests tagged version 9, latest `2026-11-25T15:04:10.559Z`. No version-10 request appeared in the result. These failures must not be relabeled as fresh v10 failures.
- Local SearXNG, the authenticated gateway, and Cloudflare Tunnel were not freshly inspected in this pass. The earlier Quick Tunnel HTTP 200 is historical and does not prove a current or stable route.
- The live v10 source remains a fixed inline implementation and is not semantically equivalent to the AgentGrid HEAD shared adaptive helper. See SC-247 for the separate source-parity gate.
- scholarship-verify is not deployed.
- The configured SearXNG gateway URL and bearer token are server-side Edge Function secrets. Do not place either value in a VITE_ variable or frontend file.

## Release requirements

Before deploying a new frontend or Edge Function:

1. Run npm ci from the lockfile.
2. Run npm audit --audit-level=moderate.
3. Run the full npm test suite.
4. Run npm run build and review bundle output.
5. Run current browser tests for authentication, backup restore, local storage failures, accessibility, and mobile behavior.
6. Test the Edge Function using isolated credentials and synthetic data.
7. Confirm the request includes only permitted search fields.
8. Review gateway uptime, request limits, timeouts, CORS, and JWT enforcement.
9. Review migration history, RLS, grants, and rollback before any schema change.
10. Smoke-test the deployed result and record its version.

Do not apply the legacy schema migration. Do not deploy the unreviewed discovery source or verification placeholder. Production deployment requires separate explicit approval.

## Rollback

Keep each artifact change independently reviewable. Artifact history retains earlier committed revisions; restore the previous source revision if a frontend change causes a regression. Database or Edge Function rollback must be planned against actual live state and cannot be assumed to be equivalent to source-control rollback.
