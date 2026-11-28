# Cross-device encrypted vault

Status: implemented on the feature branch; production promotion is tracked by the pull request and deployment record.

## User-facing behavior

Cross-device backup is optional and disabled by default. It is available only after a user signs into a permanent Scholarship Scout account and unlocks the local vault. Guest mode and anonymous Auth sessions remain browser-bound and cannot create, read, or change an account backup.

Enabling the feature registers a WebAuthn passkey and requests the authenticator PRF extension. The PRF output is used only in the browser to derive a non-exportable AES-GCM wrapping key. That key wraps the existing random local-vault content key. The browser uploads an encrypted envelope, the credential identifier, the PRF salt, and a server-side revision. The existing local vault passphrase wrapper remains in the envelope as a recovery route.

The account backup is not a plaintext profile database. Supabase cannot decrypt the envelope. The Supabase Auth session and PKCE verifier are deliberately excluded from the cross-device snapshot; each device must establish its own authenticated session. Auth session material is stored separately in a dedicated IndexedDB store encrypted with a non-exportable device key.

## Sync and conflict handling

Each account backup has a monotonically increasing revision. Updates use a compare-and-swap predicate on the expected revision, so only one writer can advance a given revision. A missing row or revision mismatch is an error; it is never treated as permission to overwrite.

The local vault tracks a write generation and dirty bit. If the user changes local records while an encrypted snapshot is being uploaded, the successful response advances the cloud revision but leaves the local state dirty and schedules another sync. If another device has already advanced the remote revision, this device pauses sync and asks the user to restore or resolve the newer backup. The application does not auto-merge independent vault histories.

## Restore and deletion

On a clean device, sign in to the same account. The app caches the authenticated account's encrypted envelope locally and presents passkey restore when available. Passkey restore requires the same synced credential and WebAuthn PRF support. If passkey PRF is unavailable, the user can unlock the cached encrypted envelope with the original local vault passphrase.

The app does not replace an unrelated local vault or legacy local student records. Restore is accepted only when the local store is empty or contains the exact ciphertext just cached for the signed-in account. Back up local work before taking any action that clears local browser data.

Deleting the cloud backup from Settings removes the account copy and disables sync on the current device; it leaves the local vault and same-device device-unlock key intact. Deleting the authenticated account cascades to its account backup row. Neither action deletes local vaults on other devices or downloaded encrypted export files.

## Security and privacy limits

- The account row stores the WebAuthn credential ID, PRF salt, encrypted envelope, revision, and timestamps. It does not store the passphrase, PRF output, decrypted content key, plaintext student records, or Supabase Auth tokens.
- RLS scopes every row to auth.uid() and excludes JWTs with is_anonymous = true.
- The browser client uses the public Supabase publishable key only; no service-role key or gateway secret is involved.
- A synced passkey depends on the credential provider actually syncing that passkey and on browser/authenticator PRF support. The passphrase remains the fallback.
- Encrypted storage protects data at rest. It does not protect decrypted records from same-origin JavaScript, malicious extensions, malware, a compromised device, or someone operating an unlocked browser.
- The current client rejects cross-device envelopes larger than 7 MB. Oversized local vaults must use the separate user-controlled encrypted export flow.

## Verification

Automated coverage is in tests/accountVaultPasskey.test.mjs and tests/localVault.test.mjs. It covers PRF capability checks, wrong/missing credential results, account-vault restore on an empty device, same-device unlock after restore, revision generation races, and sync-status shape. tests/legalAcceptanceGate.test.mjs checks disclosure of the optional encrypted backup.

The live Supabase migration 20261128040833_create_account_vault_backups has been applied. The table is RLS-enabled and excludes anonymous users through its policies. Automated tests do not replace a real-browser two-device acceptance pass; passkey provider sync, authenticator compatibility, OAuth callback, concurrent-device conflict UX, and deletion should still be checked with synthetic accounts before claiming full browser-matrix completion.
