# Backup format and restore behavior

## Payload format

New logical backups use format scholarship-scout-backup, version 2, with:

- Export timestamp.
- Local profile.
- Local scholarship tracker.
- Application checklist progress.
- Application workspace entries for tracked scholarships.

Version 1 JSON backups remain importable for compatibility. Version 1 files are plaintext and require an explicit warning; new exports are encrypted.

## Encrypted envelope

The encrypted wrapper uses format scholarship-scout-encrypted-backup, envelope version 1, PBKDF2-SHA-256 with 600,000 iterations, and AES-256-GCM.

- Random salt: 16 bytes.
- Random GCM IV: 12 bytes.
- GCM authentication tag: 128 bits.
- Format/version metadata is authenticated as additional authenticated data.
- Passphrase length: 12 through 1,024 characters.
- The password is not saved.
- Wrong passwords, altered ciphertext, malformed base64 fields, and unsupported envelope versions are rejected.

The logical restore validator enforces a 2 MiB JSON payload limit, at most 500 scholarships, bounded checklist lengths, known profile fields, valid scholarship IDs, and workspace records that reference known scholarships.

## Restore sequence

1. Reject oversized files.
2. Parse JSON.
3. Decrypt authenticated envelopes when applicable.
4. Validate the complete logical backup and linked record IDs.
5. Validate changed profile fields.
6. Show a replacement summary and ask for confirmation.
7. Normalize tracker, checklist, and workspace records.
8. Persist the four local records using the rollback-capable batch storage helper.
9. Update React state only after persistence succeeds.

## Storage limitations

The app uses a synchronous Storage-compatible vault adapter backed by an in-memory Map and encrypted IndexedDB persistence. This helper snapshots the prior values, applies the batch to the in-memory map, and restores the snapshots if a synchronous write fails. Encrypted persistence is queued asynchronously; an IndexedDB failure raises a visible warning and the app blocks a safe lock while the latest change remains unsaved.

This is a best-effort in-memory compensated transaction followed by queued encrypted persistence, not a database-grade atomic commit. The app must not claim that IndexedDB persistence can never fail or that a write is durable until the queued encrypted save completes.

## Tests

tests/backup.test.mjs covers payload structure, validation, legacy compatibility, size limits, and invalid references. tests/backupCrypto.test.mjs covers encryption round trips, random salt/IV, wrong passwords, ciphertext tampering, unsupported formats, and weak passphrases. tests/browserStorage.test.mjs now covers batch success, snapshot failure, serialization failure, and rollback after a failed write.
