# Apex / Scholarship Scout recovery verification — November 25, 2026

> **Historical snapshot notice:** This broader report preserves the earlier SC-054 recovery record and earlier release observations. Its SC-246 gateway/version facts are superseded by [the consolidated SC-246 report](sc246-gateway-recovery-2026-11-25.md), which records historical implementation snapshot HEAD `9eb1e1a99f70f2389a9d4875c48d802d1e5fa6c2`, current Supabase function version 10, and the v9-only traffic-log evidence inspected on November 25. Do not treat the older v9 statements below as current deployment inventory.

## Executive decision

**Status: BLOCKED — do not resume Apex or enable its scheduler.**

This report reconciles the available original SC-054 submission evidence and rechecks the current Scholarship Scout artifact, Supabase deployment, Vercel deployment metadata, and connected execution capabilities. It is an evidence record, not a claim that the full recovery or controlled end-to-end run completed.

Canonical Scholarship Scout repository: https://github.com/randynlinda4ever-dot/scholarship-scout
Artifact revision inspected: `680509aa2f339ccdb8eaf58a121dac334a5b7522`  
Supabase project: `wjrwvempgjvoxlioodse`  
Supabase function: `scholarship-discover`

## 1. SC-054 original BugFixer submission reconciliation

Original task identifier:

- Task ID: `d11fac2a-7ef5-47c9-9d06-390248f09932`
- Creation timestamp: `2026-11-25T09:41:37Z`
- Original outbox path on the Windows Apex machine: `data/outbox/d11fac2a-7ef5-47c9-9d06-390248f09932.txt`
- Recorded outbox size: 7,552 bytes
- Topic: “Handle invalid calendar dates”; the task requested handling impossible calendar dates, timezone boundaries, sponsor wording, and synthetic regression tests.
- Required task markers recorded in the original workflow: `APEX_COMPLETE:d11fac2a-7ef5-47c9-9d06-390248f09932` and `APEX_HEARTBEAT_REQUEST:d11fac2a-7ef5-47c9-9d06-390248f09932`.

### Reconciled event history

- At approximately 09:41:45Z, the task entered a submission-attempted state. An earlier incident note said dispatchCount was zero because the composer could not be verified within two seconds and no submit action was attempted.
- At approximately 09:59Z, a later read-only observation corrected that initial assessment: the exact prompt appeared once in ChatGPT process 9804, window 524438, while generation was active. The task was changed to `needs_review` / `submitted_pending_response`; submission uncertainty was set true.
- At approximately 10:04Z, a follow-up observation found no prompt occurrence, no captured response text (zero characters), and no response archive.
- A later observation around 11:01Z again found no prompt occurrence, no response text, and no archive.
- No successful response-capture or archive recovery is evidenced in the available history.

### Reconciliation result — corrected with owner confirmation

**Original submission: CONFIRMED NOT SUBMITTED. Original response: DOES NOT EXIST.**

On November 25, the owner explicitly confirmed after checking the original ChatGPT conversations that SC-054 was never submitted in any ChatGPT conversation or window. The new Desktop Commander connection allowed a fresh local inspection, which corroborated that finding:

- Queue status before reconciliation: `needs_review`.
- `submittedAt`, `responseReceivedAt`, and `completedAt`: all empty.
- Captured response length: 0 characters.
- Response archive: absent.
- Original bridge attempt: composer verification failed before Enter; the original event recorded `dispatchCount: 0`.
- Historical `submissionAttemptedAt`: `2026-11-25T09:41:45.254Z`; no `submittedAt` exists.

The earlier transient UI observation of a prompt during generation was ambiguous and is superseded by the owner's direct inspection of the original conversations. It was not sufficient evidence of a completed send.

The task was reconciled through the runtime's explicit `reconcile-no-execution` transition, without resending or recreating the prompt. The resulting record is:

- Status: `failed` (confirmed no execution; not completed).
- `submissionReconciliation.status`: `confirmed_no_execution`.
- `submittedAt`: null; the prior attempted timestamp remains preserved as historical evidence.
- No response or implementation is claimed.
- The original 7,552-byte outbox file is retained; no response archive was fabricated.

The runtime pause reason was updated to reflect this corrected classification and the remaining release blockers. The global pause remains active.

The application implementation associated with this topic is real but is not a response to the original BugFixer task. The artifact history contains commits:
- `48e8feb9db773832fdff26bb7594a0902469831e` — invalid-calendar-date regression tests.
- `209909f24a6139f85ca49898b1a7b66a2c0c0829` — reject malformed structured scholarship dates.
- `551f83102302a01e463c58817c5b19c8dcda3e64` — keep impossible dates in needs-review state.
- Subsequent discovery, eligibility, and documentation commits through `680509aa2f339ccdb8eaf58a121dac334a5b7522`.

Those commits establish a product-code implementation, not recovery of the missing task response or proof that the original queue item reached its completion/heartbeat handoff. Keep SC-054 in needs_review until the original response can be recovered from an authoritative archive or the task is explicitly closed as unrecoverable by the owner. Do not resubmit it.

## 2. Current code and test evidence

The GitHub source revision inspected for this historical recovery report was `680509aa2f339ccdb8eaf58a121dac334a5b7522`.

The November 25 Agent-03 audit records a targeted suite result of **145 passed, 0 failed, 0 skipped, 0 cancelled**, using Node.js 22.23.5 in an isolated network-deny sandbox. The targeted files cover discovery, adaptive query execution, URL normalization, retries, cache behavior, evidence completeness, eligibility, and source review.

The full application suite and production build were **not** run against this current revision. The earlier November 24 verification recorded:
- `npm ci`: passed
- `npm audit --audit-level=moderate`: 0 vulnerabilities
- `npm test`: 313 passed
- `npm run build`: passed

Those earlier results predate the November 25 code changes and are not current-revision verification. No matching accessible GitHub repository or CI run is available to establish a clean CI result.

### Apex runtime verification using the restored Desktop Commander connection

This is separate from the Scholarship Scout product application's test suite above. The local Apex runtime repository was freshly inspected at `C:\\Users\\levih\\Projects\\Apex-Scholarship`, branch `main`, HEAD `f6ec28e9a2de3e2480e78e2329e67cd76f469562`. The working tree already contained 13 modified tracked files and untracked backup artifacts; these were preserved. No reset, checkout, or commit was performed.

Using Node.js 26.13.0:

- `npm test`: **298 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**; 21? test files, 346,965 ms reported by the Node test runner; process exit code 0.
- JavaScript syntax: **38 files checked, 0 failures** using `node --check`.
- PowerShell bridge syntax: clean using the PowerShell parser.
- `git diff --check`: passed; Git emitted only existing LF-to-CRLF working-copy warnings.
- The Apex package defines no `build` script and has no separate build configuration. The only npm scripts are `test`, `status`, and `inspect`; therefore a production build command is not applicable to this runtime package. This does not substitute for the Scholarship Scout product build.

Fresh runtime state after SC-054 reconciliation:

- SC-054 is `failed` with `confirmed_no_execution`; no response archive exists.
- 12 tasks remain `awaiting_verification`; 25 are deferred.
- Global pause remains active with a corrected reason; no `needs_review` tasks remain.
- Windows task `Apex Scholarship Heartbeat` is Disabled.
- A manual `node src/cli.js tick` without `--dispatch` returned `status: paused` and performed no dispatch.

This was a safe pause-respecting smoke test, not a live end-to-end submission/capture test. No agent was dispatched, no prompt was sent, and no scheduler was enabled. Queue persistence across restart, real response capture/archive, completion handoff, and scheduler successor behavior remain unverified.

## 3. Supabase gateway and deployed-source parity

Live Supabase project status: `ACTIVE_HEALTHY`.

Live Edge Function facts:
- `scholarship-discover` is ACTIVE at version 9.
- `verify_jwt=false` is configured for this function.
- Deployed inline snapshot SHA-256: `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`.

The currently deployed inline source does not match the current checked-in implementation:
- Deployed v9 contains a fixed search-job plan (up to four upstream requests per category), has no adaptive query stages, no bounded transient retry, and no complete-result cache.
- Deployed v9 deduplicates using normalized sponsor domain plus title.
- The current checked-in wrapper imports `supabase/functions/_shared/scholarship-discovery.mjs`, which implements adaptive stages, bounded retry, short-lived complete-result caching, PII-aware URL normalization, and canonical URL plus normalized-title deduplication.
- The deployed function is an inline snapshot; the checked-in wrapper/helper is not byte-for-byte the deployed snapshot. Version number equality does not establish source parity.

### Live gateway evidence

The November 25 Agent-03 audit records:
- Local SearXNG service and authenticated gateway reachable through the active Quick Tunnel: HTTP 200, 15 results.
- A fresh POST to the deployed Supabase function returned HTTP 502, with four requested upstream queries, zero successful queries, four failed queries, and zero results.
- Supabase edge logs independently show version-9 POST 502 events at 10:06:32Z and 10:12:59Z.

This narrows the live failure to the Supabase-stored `SEARXNG_GATEWAY_URL` and/or `SEARXNG_GATEWAY_TOKEN`, or the deployed function's ability to reach the configured URL. The secret values were not read, printed, or changed.

The available Supabase tool integration exposes no Edge Function secret read/write operation. The connected Windows Desktop Commander account reports 0% remote-call allowance, so this pass could not retrieve the current local tunnel URL or verify the local token file. The Quick Tunnel hostname is ephemeral and is not a durable production endpoint.

**Required external configuration step:** use a stable named Cloudflare Tunnel, then securely set/verify both `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` in Supabase Function Secrets without exposing the token. Only after that should a fresh synthetic POST be used to confirm successful upstream queries and valid unverified-lead results. Do not deploy the new shared helper until a source diff, contract review, and deployment plan are completed.

## 4. Frontend deployment and browser acceptance

Vercel project `scholarship-scout-standalone` has a production deployment marked READY, created November 10, 2026. The deployment metadata returned no Git source/commit metadata and an empty metadata object. Its READY status did not prove that it matched the GitHub source revision intended for that historical release.

The connected GitHub integration returned no accessible repositories. Therefore no matching CI workflow run or commit provenance could be established.

Real-browser acceptance was not performed. The connected Browser integration reported that access requires the originating browser context, which was not available in this conversation. HTTP availability or a Vercel READY state is not a substitute for testing app hydration, runtime console, navigation, forms, search/filter behavior, signed-in/signed-out behavior, mobile layout, storage failures, and accessibility in a real browser.

No frontend deployment or promotion was performed.

## 5. Apex controlled end-to-end run and scheduler

The available historical Apex status had the system paused and the scheduler disabled. This pass could not independently refresh the local queue, process state, heartbeat, scheduler, or task archive because Desktop Commander reported 0% remote-call allowance remaining.

Consequently, none of the following is newly verified:
- durable queue persistence across restart;
- correct single-dispatch behavior;
- response capture before navigation/new-chat;
- response archival and task-to-response association;
- completion marker and heartbeat acknowledgement;
- timeout/recovery without duplicate dispatch;
- scheduler successor handoff and pause-state enforcement.

**No controlled Apex end-to-end run was performed. No agent dispatch was initiated. No scheduler was enabled.** Keep the global pause and scheduler-off barrier in place.

## 6. Changes and production impact in this verification pass

This verification pass made no changes to:
- Supabase secrets, Auth settings, database schema, RLS, migrations, or Edge Function deployment;
- Vercel deployments or aliases;
- GitHub repositories or CI;
- Apex runtime processes or scheduler configuration. The SC-054 queue record was intentionally reconciled to `failed / confirmed_no_execution`, and the existing pause reason was corrected. No task was dispatched;
- the existing SC-054 task submission.

The Supabase advisor snapshot additionally reports leaked-password protection disabled (warning), two unindexed foreign keys, and two unused indexes. These are separate security/performance follow-ups, not proof of the discovery 502 cause.

## 7. Exact release gates

Apex and the scholarship-processing workflow remain blocked until all applicable gates have evidence:

1. SC-054 is now reconciled as `confirmed_no_execution` based on the owner's direct confirmation and corroborating queue/bridge evidence. It is marked failed, not completed; preserve the outbox and do not resubmit without separate explicit authorization.
2. Stable gateway URL and matching token configured securely in Supabase; fresh synthetic public discovery POST returns successful queries and valid results.
3. Deployed Edge Function source hash and behavior match the reviewed checked-in helper, or an explicit reviewed compatibility decision documents why they differ.
4. Current-revision clean install, full test suite, dependency audit, production build, and Deno type check pass.
5. Production frontend source provenance is established; real-browser acceptance passes against that exact deployment.
6. Controlled Apex end-to-end run proves queue persistence, response capture/archive, task completion/heartbeat, duplicate prevention, recovery, and scheduler handoff.
7. Only after the preceding gates pass should the scheduler be considered for a separately controlled enablement.

Until then: **Apex PAUSED; scheduler DISABLED; SC-054 failed / confirmed_no_execution; no prompt resend.**
