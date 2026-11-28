# Public scholarship search and optional cloud accounts

## Goal

Let visitors search public scholarship listings without creating an account, while keeping cloud sponsor records private to the account that saved them.

## Public search architecture

Live scholarship discovery does not use Supabase Auth and does not create an anonymous Auth user. The frontend calls the public `scholarship-discover` Edge Function using the project's browser-safe publishable API key.

1. A visitor selects a state, graduation year, and up to four category IDs.
2. The browser sends only those broad filters to the Edge Function. It does not send the student's grades, rank, school, activities, essays, profile object, or tracker.
3. The Edge Function uses `verify_jwt=false` for this function only, validates the JSON content type, payload size, state/year fields, and category allowlist, then calls the fixed HTTPS gateway.
4. The gateway bearer token remains in the Edge Function's server-side environment. The Edge Function accepts no user-supplied destination URL.
5. Search results return as unverified research leads. They are not automatically saved to the cloud database.

## Current runtime status — November 27, 2026

Supabase reports `scholarship-discover` ACTIVE at version 19. The returned deployed entrypoint still uses `createPublicRateLimiter()`, a best-effort in-memory per-isolate limiter. Its returned helper includes adaptive search, caching, and retries, but the wrapper is not at canonical source parity.

The corrected GitHub release candidate uses `createPublicRateLimiter()` from the shared rate-limit module; Upstash is not required. It allows two requests per client IP per 60 seconds in each Edge Function isolate. The authenticated single-process gateway adds a shared ceiling of 30 upstream requests per 60 seconds across Edge Function isolates. This intentionally no-Redis design is adequate for the current single-gateway topology, but it does not provide durable daily quotas or shared in-flight concurrency leases. Do not silently introduce a Redis dependency or claim these stronger guarantees.

An earlier request failed against the obsolete Quick Tunnel hostname `plugin-loan-anybody-drilling.trycloudflare.com`. The owner confirms `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` are configured. Without revealing the token, an authenticated request using the local token source reached `https://discovery-gateway.scholarship-scout.org` and returned HTTP 200 with 15 results; the old Quick Tunnel hostname failed. This confirms the named tunnel's current reachability from the laptop, not a fresh end-to-end Supabase function call or sustained availability. See [the runtime audit](runtime-audit-2026-11-27.md).

## Optional cloud account

An authenticated Supabase account is required only to read or save cloud scholarship records. The frontend checks for a real current user before those database operations; it does not create an anonymous account just to search.

The existing database row-level security policies scope each cloud row to the active user's auth.uid(). Public discovery does not query or write scholarship tables. Student profile fields, essays, grades, activities, recommendation notes, and application workspace data stay in the encrypted local vault by default. A separate cross-device backup is available only to a permanent signed-in account after explicit opt-in; guest and anonymous Auth sessions are excluded by RLS.

Anonymous sign-ins are optional and should be enabled only if anonymous cloud scholarship saves are an intentional supported workflow. They are not needed for public live search.

## Email magic-link sign-in

The app uses Supabase email magic links for cloud account access. It sets `emailRedirectTo` to the current app frame's HTTPS origin, rather than the outer preview-host page. This matters because the app may run in an embedded preview frame: a redirect to the outer page can store the session on a different browser origin from the running app.

Supabase only accepts redirect destinations that match the project's Auth Redirect URLs allow-list. Configure only the exact origins required by the active runtime. Do not add broad wildcard redirects without a documented need. After changing the allow-list, send a fresh magic link and open it in the same browser profile where sign-in was requested. Do not reuse an old email link.

## Gateway requirements

The Edge Function forwards searches through a Node gateway on the user's laptop. SearXNG listens only on localhost port 8888; the gateway listens only on localhost port 8787 and requires the private gateway bearer token. Cloudflare Tunnel should publish only the authenticated gateway.

The Supabase Edge Function needs these server-side secrets:

- `SEARXNG_GATEWAY_URL`: current HTTPS tunnel base URL, without a trailing `/search` path.
- `SEARXNG_GATEWAY_TOKEN`: contents of the gateway token file.

Quick Tunnel hostnames change when recreated. A named Cloudflare Tunnel with a stable domain is preferable. Never put either value in browser environment variables, public source, or `.env.local`. Verify the gateway and secrets from their authoritative sources without printing the token.

## Official references

- Supabase Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase passwordless email sign-in: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase CAPTCHA protection: https://supabase.com/docs/guides/auth/auth-captcha
- Supabase Edge Function deployment: https://supabase.com/docs/guides/functions/deploy
