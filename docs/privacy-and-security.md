# Privacy and security model

## Local-first student information

The app stores profile details, academic information, activities, student-specific eligibility assessments, essays, recommendation notes, personal tasks, priorities, tags, free-form notes, and source-evidence revision history in an encrypted local vault in browser IndexedDB. The vault is unlocked by a passphrase before React workspace and Supabase Auth code are loaded.

When a sponsor URL or evidence excerpt changes, the tracker retains a snapshot of the previous public-source URLs and excerpts. The newest 25 revisions are kept per scholarship. This history is included in user-controlled encrypted backups and is not sent to cloud sponsor records.

The vault encrypts the complete Scholarship Scout storage map and the Supabase Auth session/PKCE verifier with AES-256-GCM. Its key is derived from the user's passphrase with PBKDF2-SHA-256 (600,000 iterations), a random 16-byte salt, and a fresh 12-byte IV per write. Only ciphertext and KDF metadata are persisted in IndexedDB. The key and decrypted records stay in memory while unlocked. A Web Locks exclusive lock prevents two tabs from opening the same vault simultaneously; the app locks after 15 minutes of inactivity and offers a manual lock control. The legal-acceptance receipt and generic reliability counters remain in localStorage and are not encrypted. Same-origin JavaScript running while unlocked, browser extensions with page access, malware, and an already-unlocked device can still access plaintext in memory. This is local at-rest encryption, not end-to-end encryption. Encrypted backup files remain a separate export/recovery path.

The app does not upload essays, contact details, school, district, grades, test scores, class rank, activities, or student-specific eligibility to the search service.

## Public discovery and authenticated cloud access

Public live scholarship discovery does not use Supabase Auth and does not create an anonymous Auth user. The browser sends only state, expected graduation year, and selected category IDs to the deployed public `scholarship-discover` function. This function's `verify_jwt=false` setting applies only to that discovery endpoint; it does not grant public access to database tables or other functions.

An authenticated Supabase user is required to read or write cloud scholarship sponsor records. The existing owner policies scope each row to the active user's `auth.uid()`. A read-only policy inspection confirmed that all four public tables use `TO authenticated` owner policies. No policies were changed by this authentication implementation.

Google sign-in is implemented through Supabase Auth OAuth using the `openid email profile` scopes only. The Google OAuth client secret is configured in Supabase Auth Provider settings and is never shipped to the browser. The app returns to the same runtime origin that started sign-in and explicitly uses the PKCE flow. Google and Supabase process the account identity, verified email/basic profile claims, and ordinary authentication/network metadata; the app does not request Gmail, Drive, or other Google API scopes. Google remains unavailable until the existing project's Google provider is enabled with valid credentials and the exact application return URL is allow-listed.

If the active user is an anonymous cloud session, the app calls Supabase `linkIdentity({ provider: 'google' })` rather than starting a separate sign-in. Manual identity linking must be enabled in Supabase. This links Google to the same Auth user ID, preserving existing cloud sponsor-row ownership under `auth.uid()`. If the Google identity already belongs to another account, linking fails; Scholarship Scout does not merge or reassign records automatically.

Student profile and student-specific data remain local regardless of the cloud account state. Public discovery does not create a Supabase session or upload those profile details.

## Cloud boundary

The browser Supabase client uses the publishable key only. Its persistent Supabase Auth session and PKCE verifier use the encrypted vault storage adapter, with automatic token refresh and auth-state restoration only after the user unlocks the vault.

The current browser API reads and writes the active user's `public.scholarships` sponsor records. The active identity may be an anonymous browser user or an existing permanent account. Cloud fields include scholarship title, sponsor, official HTTPS URL, award range/text, deadline, structured sponsor criteria, evidence references, and verification status. Free-form notes, evidence excerpts, and the local source-evidence revision history are intentionally excluded.

The live database also contains `student_profiles`, `scholarship_sources`, and `eligibility_checks`. The app currently does not read or write those tables. The live inventory reported zero rows in all four public tables at audit time.

## Search gateway

The client sends only state, expected graduation year, and selected category IDs. The SearXNG gateway URL and bearer token are server-side Edge Function secrets. The function uses a fixed HTTPS gateway base and rejects redirects; the browser does not provide a destination URL.

Supabase reports `scholarship-discover` ACTIVE at version 19 with `verify_jwt=false` for this function only; public discovery does not require a Supabase user JWT. The returned deployed entrypoint still uses the in-memory per-isolate limiter, while the canonical AgentGrid wrapper uses a separate Upstash-backed limiter. The returned helper includes adaptive search/cache/retry behavior, but source parity is incomplete. An earlier request failed with four DNS errors against an obsolete Quick Tunnel hostname, but a later synthetic production search returned 40 leads and Supabase logged POST 200 at `2026-11-27T05:09:06.848Z`. This is one successful request, not sustained-uptime evidence. Cloud scholarship CRUD remains authenticated and owner-scoped; this public discovery setting does not apply to other functions or database access. The search request remains limited to state, expected graduation year, and category IDs. See [the current runtime audit](runtime-audit-2026-11-27.md).

## Database authorization

All four live public tables have RLS enabled. Each table has one owner policy for the `authenticated` role matching `auth.uid()` to the row's `id` or `owner_id`. The privilege audit confirmed no direct `anon` table SELECT/INSERT, authenticated CRUD, and no authenticated TRUNCATE.

Supabase anonymous Auth users use the `authenticated` role, not the database `anon` role. Keep the existing `auth.uid()` owner checks; do not add broad table policies or grant the database `anon` role access to make anonymous search work.

The existing checked-in legacy schema migration does not match the live schema. Do not apply it. Future migrations require a reconciled migration history and review of current grants and policies.

## Backup handling

New exports use AES-256-GCM with PBKDF2-SHA-256 key derivation, random salt and IV, and authenticated format metadata. Passwords are not saved. Older unencrypted backups remain importable for compatibility with an explicit warning. Backup files are never uploaded by the app.

## Monitoring

The local reliability monitor stores only allowlisted generic event categories and timestamps, retains at most 25 records, and sends no telemetry. It does not store error messages, stack traces, URLs, forms, profile values, or essay content.

## Platform findings and owner actions

- Security Advisor warns that leaked-password protection is disabled. The app currently uses email magic links and optional Google OAuth, not password login. The project owner should enable leaked-password protection before password-based login is added.
- Public live search does not require Anonymous Sign-Ins. Enable anonymous sign-ins only if anonymous cloud scholarship saves are intentionally supported; if enabled, add CAPTCHA/Turnstile and verify the challenge flow.
- CAPTCHA/Turnstile is not yet wired into public discovery. Cloudflare crawler directives are not a bot challenge. Add server-side Turnstile verification before high-volume public launch; do not rely on CORS or client-only challenge checks.
- Define a retention/deletion policy for anonymous Auth users and their owned sponsor rows.
- Anonymous-session email linking is not implemented. Google identity linking is implemented in the app source but requires the Google provider and Supabase manual linking to be enabled; test a real OAuth callback before treating it as available. After successful linking, cloud sponsor rows remain owned by the same Auth user and can be accessed from other devices. Student profiles, essays, and the application workspace remain device-local.
- Migration `20261127052519_restrict_public_default_privileges_for_postgres.sql` now revokes default grants to `anon` and `authenticated` for future `public` tables, sequences, and functions created by the `postgres` role. The live `pg_default_acl` check confirms those grants are absent and retains `service_role` defaults. The connected SQL role cannot alter defaults owned by `supabase_admin`; its public-schema defaults remain broad and require an owner-level follow-up. Do not treat the whole default-privilege finding as closed.
- The application HTML now sets a restrictive meta Content Security Policy: same-origin scripts, no objects, same-origin base/forms, the known Supabase endpoint for API/WebSocket connections, and the existing Google Fonts origins. Inline styles remain allowed for current React style attributes; inline scripts and `unsafe-eval` are not allowed. A meta CSP cannot set `frame-ancestors`, HSTS, `X-Content-Type-Options`, or `Permissions-Policy`. Those still require verified AgentGrid/Cloudflare response-header configuration.
- Student records and Supabase session material are now stored as AES-256-GCM ciphertext in IndexedDB after passphrase unlock. The synchronous app storage interface writes to an in-memory map and queues encrypted persistence; failed writes raise a visible warning and prevent the vault from being safely locked until a later write succeeds. The legal receipt and generic reliability events remain plaintext localStorage metadata. The vault does not protect against same-origin script execution while unlocked.
## Privacy requests and support

The in-product Terms of Service and Privacy Notice designate `levi.haidar@outlook.com` as the support and privacy-request contact. Requests are submitted by email using the subjects “Privacy Request” or “Privacy Appeal”; the operator must monitor this mailbox and handle requests to the extent required by applicable law and within the operator’s actual control of the relevant data. A parent or legal guardian may submit a request on behalf of a minor where the applicable law permits.

Settings includes an in-app privacy-request form for access, correction, deletion, covered opt-outs, other privacy concerns, and appeals. It collects only a request category, submitter relationship, reply email, an appeal reference when applicable, and a short description. The form prepares an email addressed to the published privacy contact; the user must review and send that email before a request is received. The draft is not submitted to or stored by Scholarship Scout. The operator cannot retrieve or remotely erase information stored only in the user’s encrypted local vault. Do not request or accept vault passphrases, backup passwords, government identification numbers, or unnecessary student records by email. The public notice deliberately does not publish a residential street address.

Signed-in cloud accounts can be permanently deleted from Settings. The server verifies the supplied bearer token with Supabase Auth and derives the account id from that verified user; the browser cannot nominate another account. Before deleting the Auth user, the endpoint revokes all refresh-token sessions across devices. Previously issued access-token JWTs cannot be revoked immediately and may remain valid until their expiry, but they cannot be refreshed. The verified live database has ON DELETE CASCADE relationships from auth.users to student_profiles, scholarship_sources, scholarships, and eligibility_checks, so deleting the Auth user removes all current account-owned rows in those tables. The app currently has no file-upload path and the live Supabase project has no Storage buckets. Add owner-scoped Storage-object cleanup before introducing uploads or other user-owned external data stores.

The deletion form requires an explicit acknowledgement and the exact text DELETE MY ACCOUNT. A failed session-revocation step prevents Auth-user deletion. A successful cloud deletion is confirmed separately from the local vault operation, so a local cleanup failure is not misreported as a cloud deletion failure.

## Hosting response headers: not yet verified

The repository's HTML meta Content Security Policy does not replace hosting-level response headers. The production host must be checked independently for these headers; their presence and values are not verified by this source audit:

- `Strict-Transport-Security` with an appropriate max-age and includeSubDomains policy only after all subdomains are HTTPS-ready.
- `X-Content-Type-Options: nosniff`.
- `Permissions-Policy` restricting browser capabilities the application does not use.
- `Content-Security-Policy` response directives including `frame-ancestors 'none'` (this directive cannot be delivered through a meta CSP).

Do not treat these headers as deployed until the production response headers have been fetched and checked. Re-run the check after hosting configuration changes.

The optional local-data action waits for queued encrypted-vault writes, removes the encrypted IndexedDB vault, and clears Scholarship Scout-owned local and session storage plus the app's Supabase Auth session keys in the current browser profile. It preserves unrelated origin storage. It cannot erase another browser profile or device, separately downloaded backup files, or information independently retained by third-party providers. Those locations must be handled separately by the person who controls them.
