# Shared rate limiting for scholarship discovery

## Canonical source behavior

The current AgentGrid source uses `createUpstashRateLimiter` from `supabase/functions/_shared/discovery-rate-limit.mjs`. The production wrapper injects that limiter into the shared discovery handler and reads bounded configuration through `getDiscoveryRateLimitConfig`.

The shared limiter provides atomic Redis-backed quotas for client and IP windows, plus per-IP and global concurrency leases. Client and IP identifiers are HMAC-derived before they become Redis keys. The trusted client address comes from Cloudflare's `cf-connecting-ip` header; `x-real-ip` is not trusted.

The browser-provided `x-scout-client-id` is an abuse-bucketing hint, not an authenticated identity: an attacker can rotate UUIDs. The IP minute/day quotas and concurrency caps are therefore the primary anonymous abuse controls; never rely on the client quota as a standalone identity limit. Keep the trusted-ingress assumption explicit: the Edge Function's `cf-connecting-ip` value must be overwritten by the platform's trusted edge, not accepted unchanged from a caller. If the ingress topology changes, revalidate this header provenance before trusting it for quotas.

## Required server-side configuration

Configure both values as Supabase Edge Function secrets:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Never commit real credentials or prefix either secret with `VITE_`. The browser never needs these values. The canonical limiter rejects missing trusted client addresses and fails closed with HTTP 503 when shared storage is missing or unavailable. Quota exhaustion returns HTTP 429 with `Retry-After`.

The canonical `scholarship-discover` wrapper also reads bounded quota/concurrency overrides from server-side `DISCOVERY_LIMIT_*` and `DISCOVERY_UPSTREAM_CONCURRENCY` settings. Defaults and bounds are defined centrally in the shared module.

## Live deployment status — November 27, 2026

Supabase reports `scholarship-discover` ACTIVE at version 19, but the returned deployed entrypoint still imports `createPublicRateLimiter()`, the per-isolate in-memory limiter. Its returned shared helper contains an older integrated Upstash implementation, but the wrapper does not use it. The canonical separate Upstash V2 module and wrapper have not been proven deployed.

The actual presence and validity of the two Upstash secrets have not been verified. The connected Supabase integration does not expose secret read/write actions. Do not deploy the canonical wrapper until both Upstash secrets are verified and the gateway configuration is reconciled. Do not weaken fail-closed behavior or silently fall back to isolate-local limits.

See [the current runtime audit](runtime-audit-2026-11-27.md) and [the discovery system](discovery-system.md).
