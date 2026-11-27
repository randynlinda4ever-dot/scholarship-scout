# Scholarship Scout security review — November 10, 2026

> **Current verification note — November 24, 2026:** This security review is a historical snapshot. The latest recovery pass found Supabase ACTIVE_HEALTHY, all four inspected application tables still RLS-enabled with owner policies, and the discovery function ACTIVE at version 9; live discovery nevertheless returned HTTP 502 because upstream search was unavailable. The current security-advisor warning is leaked-password protection disabled. No Auth setting, secret, migration, or production configuration was changed in the recovery pass. See [recovery status](recovery-status-2026-11-24.md).

## Browser authentication and sessions

- Supabase Auth is configured with `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: true`. The application listens for `onAuthStateChange`, including the initial restored session, so the signed-in state survives a page refresh in the same browser profile.
- A session is persistent, not permanent. It can still end after sign-out, revocation, security events, or expiration.
- The browser client uses only the Supabase publishable key. No service-role or secret key is required in frontend code.

## Encryption and transport

- Exported backups use Web Crypto AES-256-GCM with a unique random 96-bit IV and 128-bit authentication tag, PBKDF2-SHA-256 key derivation with a 16-byte random salt, and authenticated format metadata. The password is never saved by Scholarship Scout.
- Encrypted backup files do not reveal their contents without the password. Wrong passwords and altered ciphertext fail authentication before import. Keep the password separately; there is no recovery mechanism.
- Older plain JSON backup files remain importable for compatibility, but new exports are encrypted by default.
- AgentGrid artifact URLs, Supabase API traffic, and the SearXNG gateway tunnel use HTTPS. The Cloudflare Tunnel provides managed edge TLS for the temporary `trycloudflare.com` hostname; no separate Let's Encrypt certificate needs to be installed on the laptop. For a future custom domain or self-hosted web server without managed TLS, use an ACME client such as Certbot and maintain automatic renewal.

## Database access controls

- Existing public tables had anonymous CRUD/TRUNCATE privileges despite RLS. Anonymous table privileges have now been revoked.
- Authenticated users retain normal SELECT/INSERT/UPDATE/DELETE only; TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, and direct sequence privileges were removed. Existing RLS owner policies continue to scope student rows to `auth.uid()`.
- The SQL execution role rejected `ALTER DEFAULT PRIVILEGES` operations with permission denied. Therefore future-table default ACLs have not been changed by this pass; a project/database owner should set least-privilege defaults separately. The current existing tables were verified after revocation.
- The scholarship discovery Edge Function is deployed as version 8 with `verify_jwt=false` so public live search does not require a Supabase user. It accepts only bounded state, graduation year, and allowlisted category inputs; rejects arbitrary destination URLs; keeps the SearXNG gateway token server-side; caps JSON request size and category count; and applies a best-effort per-IP rate limit in each Edge Function isolate. That limiter resets on cold starts and is not globally shared; persistent distributed limits and CAPTCHA/bot protection remain necessary before high-volume public rollout. Cloud database reads and writes still require a real user session and owner-scoped RLS.

## Remaining platform settings / limits

- The email provider is enabled. The magic-link flow now redirects to the current app frame origin so the Supabase session can be read by the embedded app. The preview origin must be present in Supabase Authentication → URL Configuration → Redirect URLs; add `https://bundler.sandbox.animaapp.ai/**`. Supabase otherwise falls back to the configured Site URL, which can leave the app without a session in its iframe.
- Public live search no longer requires Anonymous Sign-Ins. The public Edge Function is active, but the Supabase `SEARXNG_GATEWAY_URL` secret must always match the current laptop Quick Tunnel hostname. Quick Tunnel hostnames change on restart; a stable named tunnel is preferable.

- Scholarship Scout keeps a bounded local reliability history in browser storage. Events contain only one of four generic categories (runtime error, unhandled rejection, React render error, or storage write failure) and an ISO timestamp. The monitor stores no message, stack, URL, form data, profile data, or essay text; it retains 25 entries maximum, offers a clear control, and sends no telemetry. These diagnostics are not an external uptime or alerting service.

- Supabase Security Advisor reports leaked-password protection disabled. Scholarship Scout uses magic-link sign-in, not password login, but the project owner should still enable the setting in Supabase Auth security settings for defense in depth.
- AgentGrid and Cloudflare manage their own edge TLS certificates; the app has no direct control over their certificate renewal, WAF, bot mitigation, or platform DDoS settings. Enable platform protections when available.
- Third-party links open only after user action and use `rel="noreferrer"`. The app does not load third-party analytics or advertising scripts in its application source.
- Local profile, tracker, core checklist progress, essay prompts/drafts, recommendation notes, and application workspace data remain in browser localStorage for compatibility and offline use. They are not encrypted at rest; only downloaded backup files are encrypted. Version-2 backups cover the application workspace as well as profile/tracker/checklists; version-1 backups remain importable. Browser storage is not a secure vault and same-origin JavaScript can read it. Preventing active XSS and compromised browser scripts remains necessary. Do not use a shared browser profile for sensitive drafts. The optional CSV tracker report is also a plain, unencrypted file downloaded at the user's request; it is not uploaded to Supabase or any search service. Treat it like other personal application records and do not leave it on a shared device.
- The source bundle no longer contains the user's prefilled GPA, rank, test scores, school, activities, or identifying academic profile defaults. Existing values saved in this browser's local profile are still loaded.
- Verification on the latest public-search/auth callback source: `npm test` passed **217/217**; `npm run build` passed TypeScript and Vite production build (82 modules); `npm audit --audit-level=moderate` reported zero vulnerabilities. Chrome 157 testing at 1440, 768, 390, and 320 CSS-pixel widths found no horizontal overflow; modal focus trapping/Escape/restore worked, cloud controls were disabled offline, the accessibility tree exposed named landmarks/dialogs/controls, and all six main screens in both themes had zero measured text contrast failures. The final browser run reported no console errors or failed network requests. A spoken Narrator/NVDA listen-through and full WCAG conformance assessment were not performed.
- Live Supabase checks confirmed RLS is enabled on all four existing tables, anonymous table access is revoked, authenticated CRUD remains available under owner policies, and authenticated `TRUNCATE` is revoked. The public discovery function is version 8 with `verify_jwt=false`; it does not query or write scholarship tables.
- These measures reduce risk but do not constitute a full penetration test or guarantee that the app is vulnerability-free.
