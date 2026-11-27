# Shared rate limiting for scholarship discovery

The public `scholarship-discover` Edge Function uses Upstash Redis as an atomic shared rate-limit store. A Lua script increments a per-client counter and sets its expiry once, so concurrent and horizontally scaled function instances share the same limit.

## Configure before deploying

Create an Upstash Redis database with its HTTPS REST URL and REST token, then add both as Supabase Edge Function secrets:

```sh
supabase secrets set UPSTASH_REDIS_REST_URL=https://YOUR_DATABASE.upstash.io UPSTASH_REDIS_REST_TOKEN=YOUR_REST_TOKEN
```

Do not commit real credentials or prefix either secret with `VITE_`. The browser never needs these values. The limiter HMACs the trusted Cloudflare client address before using it as a Redis key, so the raw address is not stored. It rejects missing trusted addresses and fails closed with HTTP 503 if the store is not configured or unavailable. A full bucket returns HTTP 429 with `Retry-After`.

## Deployment boundary

This source change does not set Supabase secrets or deploy the function. Configure the two Edge Function secrets before deploying this revision. The existing live deployment remains unchanged until a deliberate release. Do not deploy this revision with the secrets missing: discovery will intentionally return 503 rather than silently falling back to isolate-local limits.
