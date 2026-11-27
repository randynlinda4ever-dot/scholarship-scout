# Scholarship discovery rate-limit decision — November 27, 2026

## Decision

Keep the existing no-Redis architecture for the current single-gateway deployment. Do not make Upstash a required runtime dependency and do not require `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN`.

The release candidate's Edge Function wrapper uses `createPublicRateLimiter()`. It trusts only the platform-provided `cf-connecting-ip` address, allows two requests per IP per 60-second window per Edge Function isolate, and returns HTTP 429 with `Retry-After` on quota exhaustion. If no trusted client address is available, the handler fails closed with HTTP 503.

The authenticated Node gateway is the shared upstream control point. Its single process accepts at most 30 authenticated `GET /search` requests in each 60-second window, across all Supabase Edge Function isolates. It requires the existing server-side `SEARXNG_GATEWAY_TOKEN`. The gateway token is checked before the process quota is consumed. The browser's `x-scout-client-id` remains allowed through CORS for the client request contract; it is not trusted as a rate-limit identity.

## Why Upstash is not required

The branch previously wired `createUpstashRateLimiter()` as a mandatory dependency. Without the two Redis secrets, that wrapper would return HTTP 503 for every request before the SearXNG gateway was called. The owner confirms the two SearXNG gateway secrets are configured; Upstash credentials are not.

The gateway already provides a single shared process-level upstream request ceiling. Adding a mandatory Redis service now would introduce another external dependency and an all-searches-fail condition without being necessary for the current single-gateway topology.

The separate Upstash implementation and its unit tests remain in the repository as an optional future alternative. They are not imported by the current production candidate wrapper.

## Verified evidence

- Read the local gateway implementation at `%USERPROFILE%\searxng-local\gateway\server.mjs`: it enforces 30 authenticated requests per 60 seconds in one process.
- Direct authenticated request to `http://127.0.0.1:8787/search`: HTTP 200, 15 results.
- Direct authenticated request to `https://discovery-gateway.scholarship-scout.org/search`: HTTP 200, 15 results.
- The saved Quick Tunnel hostname `plugin-loan-anybody-drilling.trycloudflare.com` failed. Treat it as stale; use the named gateway hostname.
- The local token was read only into process memory for these checks. It was not printed, written to source, or included in command output.
- Targeted edge and limiter tests passed after the release wrapper was changed to use the per-isolate limiter.

These checks establish gateway reachability and the behavior of the release wrapper's local limiter. They do not prove a fresh request through the deployed Supabase function.

## Explicit trade-offs and scale-up triggers

This design is a bounded safety layer, not a durable distributed quota system:

- Per-IP counters are isolate-local; a user may receive separate buckets when requests reach different isolates.
- The gateway's 30-per-minute counter is shared across isolates only because those requests converge on one gateway process.
- The gateway counter resets on process restart.
- The gateway currently has no shared in-flight concurrency lease or explicit global concurrency cap.
- There is no durable per-client daily quota or per-IP daily quota.
- Multiple gateway replicas would each have their own process counter unless a shared coordinator were introduced.

Before increasing traffic, adding gateway replicas, or moving the gateway off the single laptop process, add and test a central rate/concurrency coordinator at the gateway layer or deliberately provision a shared store. Do not silently switch the Edge Function to Upstash.

## Deployment gates

1. Keep the Edge Function's gateway secrets server-side and never log or disclose their values.
2. Review and deploy the exact GitHub/AgentGrid-synchronized Edge Function source as one versioned file set.
3. Verify CORS preflight for `x-scout-client-id`, the Edge Function 429/503 behavior, the gateway's 30-per-minute 429 behavior, and synthetic discovery.
4. Preserve the version-19 rollback snapshot and record the new deployed function version/source hash.
5. Do not promote the frontend to production merely because the Vercel preview is ready; public discovery needs a successful Supabase-to-named-gateway smoke test.
