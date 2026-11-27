# Local SearXNG gateway

## Local services

The SearXNG container publishes its web/API port only to `127.0.0.1:8888`. Store its persistent configuration beneath the local project data directory.

The Node gateway listens only on `127.0.0.1:8787`. It accepts authenticated `GET /search` requests, checks the bearer token in constant time, applies request limits, forwards bounded page values (1–2) to SearXNG, and returns trimmed JSON results.

Keep the gateway token in a local file such as:

```text
%USERPROFILE%\searxng-local\gateway\gateway-token.txt
```

The Cloudflare Tunnel should publish only the authenticated gateway, not SearXNG's port 8888 directly.

## Supabase function secrets

In the existing project's Edge Function Secrets page, configure:

- `SEARXNG_GATEWAY_URL`: the current HTTPS tunnel base URL, without a trailing `/search` path.
- `SEARXNG_GATEWAY_TOKEN`: the contents of the local gateway-token file.

Do not add either value to `.env.local`, a `VITE_*` variable, browser source, or a checked-in file. The Edge Function reads these as server-side secrets and constructs the `/search` path itself.

## Tunnel limitations

Cloudflare Quick Tunnels are experimental and do not have an uptime guarantee. Their hostname can change when the tunnel is restarted. If it changes, update `SEARXNG_GATEWAY_URL` in Supabase Function Secrets.

The host running the tunnel must remain powered on, awake, online, and running the container, Node gateway, and `cloudflared` while searches are needed. For a stable long-term URL, use a named Cloudflare Tunnel with a domain configured for it.

## Start commands after a restart

Start Docker Desktop and wait for its Linux engine to report ready. Then start the gateway in PowerShell:

```powershell
$dir = Join-Path $env:USERPROFILE 'searxng-local\gateway'
$env:SCOUT_GATEWAY_TOKEN = (Get-Content (Join-Path $dir 'gateway-token.txt') -Raw).Trim()
Set-Location $dir
node .\server.mjs
```

In a second PowerShell window, start a new Quick Tunnel:

```powershell
& 'C:\Program Files (x86)\cloudflared\cloudflared.exe' tunnel --no-autoupdate --url http://127.0.0.1:8787
```

Copy the new HTTPS hostname printed by `cloudflared` into the Supabase `SEARXNG_GATEWAY_URL` secret. The currently running tunnel hostname is also written locally to `%USERPROFILE%\searxng-local\gateway\current-tunnel-url.txt` for copying into the Dashboard. That local file is not part of the public artifact. Keep the gateway token secret unchanged.

## Validation history — November 12, 2026

- The local SearXNG container was restarted successfully.
- The authenticated local Node gateway returned HTTP 200 and 15 search results.
- The new Quick Tunnel returned HTTP 200 and 15 results when called directly with the gateway bearer token.
- The public Supabase `scholarship-discover` function is deployed as version 8 with `verify_jwt=false`. An unauthenticated call reached the function but returned 502 while its configured gateway URL still pointed to an unavailable upstream.
- The current Quick Tunnel hostname changes on restart. Update the Supabase `SEARXNG_GATEWAY_URL` secret to the currently running hostname before expecting the cloud function to return results. The `SEARXNG_GATEWAY_TOKEN` secret stays unchanged.
- The public function has a best-effort per-isolate rate limit. It is not a distributed rate limiter; add persistent limits and CAPTCHA/bot protection before high-volume public rollout.
