# Supabase owner-only security follow-ups

The GitHub repository contains the SQL source in `supabase/manual/restrict_public_default_privileges_for_supabase_admin.sql`. It is deliberately not an automatically applied migration because the connected `postgres` account cannot assume the `supabase_admin` role.

## Apply the remaining database hardening

PostgreSQL returned `42501 permission denied to change default privileges` for `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`, and `SET ROLE supabase_admin` was also denied. Do not try to grant `supabase_admin` membership to `postgres` as a workaround.

Run the manual SQL from a database-owner session that is authorized to change defaults owned by `supabase_admin`, or ask the Supabase project owner/support to execute it through the supported administrative path. The script revokes default grants to `anon` and `authenticated` for future public tables, sequences, and functions. It does not change existing object grants, RLS policies, owner privileges, or `service_role` defaults.

The final verification query should return zero rows for the `anon` and `authenticated` grantees under `supabase_admin` / `public`. Re-run the full `pg_default_acl` audit for both `postgres` and `supabase_admin` before marking the finding resolved.

## Discovery limiter deployment

The committed GitHub Edge Function wrapper uses the distributed Upstash limiter and fails closed with HTTP 503 when the shared limiter is unavailable. The live Supabase function was still version 19 using the per-isolate in-memory limiter at the last check.

Before deploying:

1. Verify that `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are both configured in Supabase Edge Function secrets for project `wjrwvempgjvoxlioodse`. Never copy their values into repository source, logs, or chat. The URL must be HTTPS; the token must be at least 32 characters.
2. Confirm the existing `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` remain configured and point to the durable named gateway. Do not replace them with a transient Quick Tunnel hostname.
3. Save the exact currently deployed version-19 function files, entrypoint, verification setting, and deployment metadata as the rollback package.
4. Deploy the historical implementation snapshot entrypoint together with `_shared/discovery-rate-limit.mjs`, `_shared/scholarship-discovery.mjs`, and its `_shared/us-states.mjs` dependency. Keep `verify_jwt=false` only for this intentionally public discovery endpoint.
5. Send a synthetic request containing only state, graduation year, and category IDs. Confirm a normal request succeeds, a repeated same-client request receives HTTP 429 with `Retry-After`, and a Redis outage or missing secret produces HTTP 503 (fail closed). Also verify the gateway returns only bounded public HTTPS leads.
6. Record the new function version and source hash. Keep the old version-19 files so rollback means redeploying the captured old entrypoint and its matching helper files, then re-run the same synthetic request.

Do not deploy until the two Upstash secrets are confirmed. This preserves the currently working endpoint instead of turning every request into a 503 because its shared limiter has no credentials.

## Public bot protection and hosting headers

- Cloudflare `robots.txt` crawler exclusions are not request-level bot protection. Turnstile is not yet wired to the public discovery challenge/verification flow. Add it only when both the public site key and server-side secret are available; the Edge Function must verify the token server-side and reject missing, invalid, expired, or replayed tokens. CORS and client-side checks are not authentication.
- The current `index.html` has a restrictive meta CSP. The actual public `scholarship-scout.org` response was graded D on 2026-11-27 05:51 UTC: the scanner saw HSTS but did not see CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy as response headers. Configure these at the active hosting/edge layer, then scan again. A meta CSP does not set `frame-ancestors`; set it as a response header only after confirming the actual historical implementation snapshot embedding parent origins. Do not apply `X-Frame-Options: SAMEORIGIN` blindly if the app must be framed cross-origin.

## Follow-up: active limiter choice — November 27, 2026

**The Upstash deployment procedure below is superseded for the current single-gateway topology. Do not follow its Redis secret prerequisites or deploy the Redis-backed wrapper.** The owner confirmed that only the SearXNG gateway secrets are configured. Inspection found an existing authenticated gateway ceiling of 30 upstream requests per 60 seconds, in addition to the Edge Function's two-per-minute per-IP per-isolate limiter.

The corrected GitHub release candidate uses that existing no-Redis design. The two Upstash secret names are not required and must not be populated solely to satisfy the earlier wrapper. A direct authenticated local request to the named gateway returned HTTP 200 with 15 results. Production Supabase remains on v19; deploy only after source synchronization, review, and rollback confirmation. See `rate-limit-decision-2026-11-27.md`.