# Public scholarship search and optional cloud accounts

## Goal

Let visitors search public scholarship listings without creating an account, while keeping cloud sponsor records private to the account that saved them.

## Public search architecture

Live scholarship discovery does **not** use Supabase Auth. The frontend calls the deployed `scholarship-discover` Edge Function using the project's browser-safe publishable API key.

1. A visitor selects a state, graduation year, and up to four category IDs.
2. The browser sends only those broad filters to the Edge Function. It does not send the student's grades, rank, school, activities, essays, profile object, or tracker.
3. The Edge Function is deployed with `verify_jwt=false`, validates the JSON content type, payload size, state/year fields and category allow-list, then calls the fixed HTTPS gateway.
4. The gateway bearer token remains in the Edge Function's server-side environment. The Edge Function accepts no user-supplied destination URL.
5. Search results are returned as unverified research leads. They are not automatically saved to the cloud database.

The function currently caps request bodies at 8 KB, allows at most four categories, and uses a best-effort in-memory limit of two Edge Function requests per client IP per 60-second window. This limiter is local to an Edge Function isolate, resets on cold starts, and is not a distributed abuse-control system. Add persistent rate limiting and CAPTCHA/bot protection before high-volume public rollout.

## Optional cloud account

An authenticated Supabase account is only required to read or save cloud scholarship records. The frontend checks for a real current user before those database operations; it does not create an anonymous account just to search.

The existing database row-level security policies continue to match `owner_id` to `auth.uid()`. Public discovery does not query or write scholarship tables. Student profile fields, essays, grades, activities, recommendation notes, and application workspace data stay in browser local storage.

## Email magic-link sign-in

The app uses Supabase email magic links for cloud account access. It sets `emailRedirectTo` to the current app frame's HTTPS origin, rather than the outer AgentGrid artifact page. This matters because the app runs in an Anima preview frame: a redirect to the outer page can store the session on a different browser origin from the running app.

Supabase only accepts redirect destinations that match the project's Auth Redirect URLs allow-list. Add this observed preview pattern under **Authentication → URL Configuration → Redirect URLs**:

`https://bundler.sandbox.animaapp.ai/**`

Retain the intended public artifact URL too if it is used as an authentication callback in another runtime. Supabase documents that non-allow-listed redirect destinations fall back to the configured Site URL. After changing the allow-list, send a fresh magic link and open it in the same browser profile where sign-in was requested. Do not reuse an old email link.

## Local search service and tunnel

The Edge Function forwards searches through a Node gateway on the user's laptop. SearXNG listens only on localhost port 8888; the gateway listens only on localhost port 8787 and requires the private gateway bearer token. Cloudflare Tunnel publishes only the authenticated gateway.

The Supabase Edge Function must have these server-side secrets:

- `SEARXNG_GATEWAY_URL`: current HTTPS Quick Tunnel base URL, without a trailing `/search` path.
- `SEARXNG_GATEWAY_TOKEN`: contents of the gateway token file.

Quick Tunnel hostnames change when recreated. Whenever the laptop's tunnel is restarted, update `SEARXNG_GATEWAY_URL` in Supabase **Edge Functions → Secrets**. Do not put either value in browser environment variables, public source, or `.env.local`.

The Docker container, gateway process, and Cloudflare Tunnel must remain running and the laptop must stay awake and online while live search is needed. A named Cloudflare Tunnel with a stable domain is preferable for a reliable long-term deployment.

## Official references

- Supabase Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase passwordless email sign-in: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase CAPTCHA protection: https://supabase.com/docs/guides/auth/auth-captcha
- Supabase Edge Function deployment: https://supabase.com/docs/guides/functions/deploy
