# Optional Upstash rate-limiter alternative

> **Status — November 27, 2026:** This is retained implementation code for a possible future scale-up, not the active discovery architecture. The current GitHub release candidate intentionally uses the no-Redis per-isolate limiter plus the authenticated gateway's process-wide request ceiling. Do not add Upstash secrets or deploy this alternative unless the owner explicitly chooses a shared Redis dependency after staging tests.

## What the optional alternative provides

The repository retains `createUpstashRateLimiter` in `supabase/functions/_shared/discovery-rate-limit.mjs`. It provides atomic Redis-backed quotas for client and IP windows, plus per-IP and global concurrency leases. Client and IP identifiers are HMAC-derived before they become Redis keys. The trusted client address comes from Cloudflare's `cf-connecting-ip` header; `x-real-ip` is not trusted.

The browser-provided `x-scout-client-id` is an abuse-bucketing hint, not an authenticated identity: an attacker can rotate UUIDs. The IP minute/day quotas and concurrency caps are therefore the primary anonymous abuse controls. Revalidate the `cf-connecting-ip` provenance if the ingress topology changes.

## Configuration if deliberately adopted later

A future Upstash deployment would require these server-side Supabase Edge Function secrets:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

It also supports bounded server-side `DISCOVERY_LIMIT_*` and `DISCOVERY_UPSTREAM_CONCURRENCY` overrides. Never commit credentials or expose them in `VITE_*` variables.

If deliberately activated, the limiter fails closed with HTTP 503 when shared storage is missing or unavailable and returns HTTP 429 with `Retry-After` on quota exhaustion. Those behaviors must be tested against the real staging Upstash REST endpoint, not only mocked or local Redis.

## Current architecture

The active GitHub release candidate does not call `createUpstashRateLimiter`. It uses:

- Two requests per client IP per 60 seconds per Supabase Edge Function isolate.
- Thirty authorized upstream `/search` requests per 60 seconds in the single authenticated gateway process, shared across Edge Function isolates.

This is appropriate for the current single-gateway topology. It does not provide durable per-client daily limits, shared in-flight concurrency leases, or counter persistence across gateway restarts. See [the rate-limit decision record](rate-limit-decision-2026-11-27.md), [the runtime audit](runtime-audit-2026-11-27.md), and [the discovery system](discovery-system.md).
