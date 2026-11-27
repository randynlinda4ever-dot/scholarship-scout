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

The current AgentGrid wrapper uses `createUpstashRateLimiter()` from the separate shared rate-limit module. It applies distributed quotas and concurrency leases, and requires the server-side secrets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Those secrets were not verified in this audit. Do not deploy the canonical wrapper until they are verified; it intentionally fails closed with HTTP 503 if shared storage is unavailable.

An earlier request failed with four upstream DNS errors against `plugin-loan-anybody-drilling.trycloudflare.com`, but a later synthetic production search returned 40 leads and Supabase logged POST 200 at `2026-11-27T05:09:06.848Z`. This proves one successful request, not sustained reliability. The named-tunnel URL `https://discovery-gateway.scholarship-scout.org` is documented but was not directly health-checked. The gateway secrets `SEARXNG_GATEWAY_URL` and `SEARXNG_GATEWAY_TOKEN` were not read or changed. See [the runtime audit](runtime-audit-2026-11-27.md).

## Optional cloud account

An authenticated Supabase account is required only to read or save cloud scholarship records. The frontend checks for a real current user before those database operations; it does not create an anonymous account just to search.

The existing database row-level security policies scope each cloud row to the active user's `auth.uid()`. Public discovery does not query or write scholarship tables. Student profile fields, essays, grades, activities, recommendation notes, and application workspace data stay in browser local storage.

Anonymous sign-ins are optional and should be enabled only if anonymous cloud scholarship saves are an intentional supported workflow. They are not needed for public live search.

## Email magic-link sign-in

The app uses Supabase email magic links for cloud account access. It sets `emailRedirectTo` to the current app frame's HTTPS origin, rather than the outer AgentGrid artifact page. This matters because the app may run in an embedded preview frame: a redirect to the outer page can store the session on a different browser origin from the running app.

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
