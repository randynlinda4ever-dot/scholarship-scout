# Privacy and security model

## Local-first student information

The app keeps profile details, academic information, activities, student-specific eligibility assessments, essays, recommendation notes, personal tasks, priorities, tags, free-form notes, and source-evidence revision history in browser localStorage.

When a sponsor URL or evidence excerpt changes, the tracker retains a snapshot of the previous public-source URLs and excerpts. The newest 25 revisions are kept per scholarship. This history is included in user-controlled encrypted backups and is not sent to cloud sponsor records.

This data is not encrypted at rest. Same-origin JavaScript can read localStorage. Encrypted backup files protect downloaded exports, not the live browser store. The primary controls are safe rendering, input validation, dependency hygiene, and prevention of script injection. Do not describe localStorage as a secure vault.

The app does not upload essays, contact details, school, district, grades, test scores, class rank, activities, or student-specific eligibility to the search service.

## Public discovery and authenticated cloud access

Public live scholarship discovery does not use Supabase Auth and does not create an anonymous Auth user. The browser sends only state, expected graduation year, and selected category IDs to the deployed public `scholarship-discover` function. This function's `verify_jwt=false` setting applies only to that discovery endpoint; it does not grant public access to database tables or other functions.

An authenticated Supabase user is required to read or write cloud scholarship sponsor records. The existing owner policies scope each row to the active user's `auth.uid()`. A read-only policy inspection confirmed that all four public tables use `TO authenticated` owner policies. No policies were changed by this documentation task.

Student profile and student-specific data remain local regardless of the cloud account state. Public discovery does not create a Supabase session or upload those profile details.

## Cloud boundary

The browser Supabase client uses the publishable key only. It uses persistent sessions, automatic token refresh, and auth-state restoration.

The current browser API reads and writes the active user's `public.scholarships` sponsor records. The active identity may be an anonymous browser user or an existing permanent account. Cloud fields include scholarship title, sponsor, official HTTPS URL, award range/text, deadline, structured sponsor criteria, evidence references, and verification status. Free-form notes, evidence excerpts, and the local source-evidence revision history are intentionally excluded.

The live database also contains `student_profiles`, `scholarship_sources`, and `eligibility_checks`. The app currently does not read or write those tables. The live inventory reported zero rows in all four public tables at audit time.

## Search gateway

The client sends only state, expected graduation year, and selected category IDs. The SearXNG gateway URL and bearer token are server-side Edge Function secrets. The function uses a fixed HTTPS gateway base and rejects redirects; the browser does not provide a destination URL.

The deployed `scholarship-discover` function is ACTIVE at version 9 with `verify_jwt=false` for this function only; public discovery does not require a Supabase user JWT. Direct inspection identified an inline deployed source snapshot (SHA-256 `5ebc47c217ffdaf9234df5ce12fa4860f671e0641febca218a87aee6a98bc328`). The committed shared-helper optimizations are not deployed and source parity is not established. Cloud scholarship CRUD remains authenticated and owner-scoped; this public discovery setting does not apply to other functions or database access. The search request remains limited to state, expected graduation year, and category IDs.

## Database authorization

All four live public tables have RLS enabled. Each table has one owner policy for the `authenticated` role matching `auth.uid()` to the row's `id` or `owner_id`. The privilege audit confirmed no direct `anon` table SELECT/INSERT, authenticated CRUD, and no authenticated TRUNCATE.

Supabase anonymous Auth users use the `authenticated` role, not the database `anon` role. Keep the existing `auth.uid()` owner checks; do not add broad table policies or grant the database `anon` role access to make anonymous search work.

The existing checked-in legacy schema migration does not match the live schema. Do not apply it. Future migrations require a reconciled migration history and review of current grants and policies.

## Backup handling

New exports use AES-256-GCM with PBKDF2-SHA-256 key derivation, random salt and IV, and authenticated format metadata. Passwords are not saved. Older unencrypted backups remain importable for compatibility with an explicit warning. Backup files are never uploaded by the app.

## Monitoring

The local reliability monitor stores only allowlisted generic event categories and timestamps, retains at most 25 records, and sends no telemetry. It does not store error messages, stack traces, URLs, forms, profile values, or essay content.

## Platform findings and owner actions

- Security Advisor warns that leaked-password protection is disabled. The app currently uses magic links, not password login. The project owner should enable the protection before password-based login is added.
- Enable Anonymous Sign-Ins in Supabase Auth before testing the new no-email live-search path.
- Enable CAPTCHA/Turnstile and configure the client challenge before public rollout.
- Define a retention/deletion policy for anonymous Auth users and their owned sponsor rows.
- Anonymous-session email linking and cross-device recovery are not implemented. Do not tell users that anonymous cloud saves can be recovered after browser storage is cleared.
- The database role could not alter global default privileges in the previous hardening pass. A project/database owner should review default grants for future tables.
- A browser XSS incident could expose local student data. Continue to avoid unsafe HTML sinks and unreviewed third-party scripts; add a hosting CSP when the platform permits.
- Account deletion and reliable clearing of locally stored records still need a reviewed user-facing workflow.
