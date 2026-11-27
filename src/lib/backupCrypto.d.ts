export type EncryptedBackupEnvelope = {
  format: "scholarship-scout-encrypted-backup";
  version: 1 | 2;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
};

export declare const BACKUP_ENVELOPE_FORMAT: string;
export declare const BACKUP_ENVELOPE_VERSION: number;
export declare const MAX_ENCRYPTED_BACKUP_FILE_BYTES: number;
export declare function isEncryptedBackupEnvelope(value: unknown): value is EncryptedBackupEnvelope;
export declare function encryptBackup(payload: unknown, passphrase: string): Promise<EncryptedBackupEnvelope>;
export declare function decryptBackup(envelope: EncryptedBackupEnvelope, passphrase: string): Promise<unknown>;
