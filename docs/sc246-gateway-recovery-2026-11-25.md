# SC-246 — Production discovery gateway recovery

**Disposition: OPEN · P0 · NOT RESOLVED**

This is the consolidated SC-246 report. It supersedes the earlier conflicting status openings: the artifact inspection and current-state checks below were performed; no product artifact source changes, Cloudflare changes, Supabase secret writes, or Edge Function deployment were performed.

## Scope

Restore a durable authenticated route from the deployed Supabase `scholarship-discover` function to the existing SearXNG gateway. Confirm both required server-side secret names without displaying values, establish a stable HTTPS endpoint, and prove the route with a fresh authenticated gateway health check and synthetic Supabase discovery request. Preserve the rule that gateway credentials never enter browser code.

## Owner authorization

On November 25, 2026, the project owner explicitly approved the Cloudflare Tunnel and Supabase gateway-infrastructure actions required for this task. No further project-owner approval is outstanding for those SC-246 actions. That authorization does not create missing Cloudflare account access, a local-host execution channel, or a Supabase secret-write/invocation capability; none of those actions is claimed below.

## Current evidence

| Area | Current observation | Assessment |
|---|---|---|
| Product implementation snapshot used for source comparison | AgentGrid revision `9eb1e1a99f70f2389a9d4875c48d802d1e5fa6c2`; product files were not changed in the report-only commit | Verified |
| SC-246 report commit | Documentation-only AgentGrid revision `bd50d06fc873f4d28cbae60b74af0e2f5465030d` | Verified |
| Apex queue record | SC-246 remains P0, `needs_review`; Apex is paused, one-task limit is 1, and its scheduler is Disabled | Verified |
| Supabase project | `wjrwvempgjvoxlioodse`, `ACTIVE_HEALTHY`, `us-east-1` | Verified |
| Deployed function | `scholarship-discover`, ACTIVE, version 10, `verify_jwt=false` | Verified |
| Deployed source hash | `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328` | Verified |
| Deployed file layout | One inline `index.ts` returned by Supabase; it is not the AgentGrid wrapper plus shared helper | Verified |
| Secret names | Source references `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` server-side | Names verified in source only |
| Secret presence/configuration | No secret metadata read/write action is exposed by the connected Supabase integration | NOT VERIFIED |
| Secret values | Not read, printed, copied, or changed | Protected |
| Stable named Cloudflare Tunnel | No current Cloudflare account/host control was available in this pass; prior inspection recorded an ephemeral Quick Tunnel and missing origin certificate | NOT VERIFIED in this pass |
| Local authenticated gateway | Prior report recorded HTTP 200 with 15 synthetic results through a Quick Tunnel; no fresh local request was made | Historical evidence only |
| Fresh Supabase synthetic POST | No function-invocation action is exposed by the connected Supabase integration; no fresh POST was sent | NOT RUN |
| Product tests/build | No authorized Scholarship Scout product runner was available through AgentGrid or the connected Supabase tools | NOT RUN |

### Supabase traffic-log clarification

The current function inventory reports version 10. The inspected `function_edge_logs` window contained seven POST requests, all HTTP 502, all tagged version 9, with the latest observed at `2026-11-25T15:04:10.559Z`. The corresponding runtime records also reference deployment suffix `_9`.

Therefore, the 502s are real historical traffic evidence for version 9, but they do **not** prove that the currently listed version 10 has itself failed a fresh request. No version-10 invocation appeared in the inspected log results. A fresh version-10 synthetic request is still required.

### Deployed source versus current AgentGrid source

The deployed v10 inline `index.ts` uses `buildSearchJobs` and `runBoundedSearches`. It creates a fixed two-variation/two-page plan per selected category (up to 16 upstream requests for four categories). It reports the basic requested/successful/failed query counts.

The reviewed AgentGrid implementation snapshot's wrapper imports `supabase/functions/_shared/scholarship-discovery.mjs`. That current helper includes adaptive staged search, a 30-second per-isolate complete-result cache, one bounded retry for configured transient HTTP statuses, and detailed failure-reason codes.

The deployed inline source does not contain the helper's adaptive runner, cache, bounded retry implementation, or detailed failure-reason summary. The deployed source hash therefore remains a separate release-parity fact; matching version numbers do not establish parity. Source-parity work should remain coordinated with SC-247 rather than being silently folded into SC-246.

## What changed in this pass

- Created this consolidated report with one consistent opening and explicit evidence labels.
- Updated the artifact's current backend-status documentation to distinguish the live v10 inventory from v9-only traffic logs.
- Preserved the canonical product implementation and historical recovery evidence.
- No product code, frontend code, database schema, RLS, migrations, secrets, tunnel configuration, DNS, or Edge Function deployment was changed.
- No completion marker was emitted. SC-246 remains P0 and open.

## Remaining blockers

1. **Cloudflare control and host setup:** the connected tools do not currently provide Cloudflare account/tunnel administration or an authorized way to configure/run the local `cloudflared` connector. The earlier Quick Tunnel result is not a stable endpoint.
2. **Supabase secret write and verification:** the connected Supabase toolset can inspect the project and function but does not expose a secrets-list/set action. Secret values remain protected. Both `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` must be configured in the server-side Function Secrets store.
3. **Fresh function invocation:** the current connector has no invoke-function action. The latest 502 evidence is for v9; version 10 still needs a synthetic POST.
4. **Source parity:** the live v10 inline implementation and AgentGrid helper are not semantically aligned. SC-247 owns the reviewed source-parity gate; do not deploy the helper as an incidental part of gateway repair.

## Closure criteria

Keep SC-246 OPEN at P0 until all of the following are evidenced:

1. A named Cloudflare Tunnel publishes only the authenticated gateway service at `127.0.0.1:8787`; do not expose SearXNG directly on port 8888.
2. The stable HTTPS base URL and matching bearer token are set as the two existing Supabase Edge Function secrets. Verify secret names/configuration metadata without revealing values.
3. A fresh authenticated gateway health/search request returns HTTP 2xx and synthetic results.
4. A fresh synthetic POST to the currently deployed `scholarship-discover` version returns HTTP 2xx, `summary.successfulQueries > 0`, and bounded `unverified_lead` results; verify partial-failure counters and confirm no private student fields or secrets are returned.
5. Preserve redacted request/response metadata, function version/hash, and rollback steps. Do not claim source parity until SC-247 independently verifies it.

## Next actions

1. Establish an authorized Cloudflare dashboard and local-host control path for the named tunnel.
2. Use an authorized Supabase Dashboard/CLI path to reconcile the two existing server-side secrets without exposing either value.
3. Run and archive fresh authenticated gateway and Supabase synthetic checks against the current function version.

**Final status: SC-246 remains OPEN / P0. Owner authorization is recorded. No infrastructure mutation or completion is claimed.**
