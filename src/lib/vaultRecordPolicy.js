export const PRIVATE_VAULT_RECORD_KEYS = Object.freeze([
  "scout-profile",
  "scout-profile-draft",
  "scout-scholarships",
  "scout-application-progress",
  "scout-application-workspace",
  "scout-resource-workspace",
]);

export const UI_PREFERENCE_RECORD_KEYS = Object.freeze([
  "scout-sidebar-collapsed",
  "scout-theme",
  "scout-theme-choice",
  "scout-compact-view",
]);

export const SESSION_ONLY_RECORD_KEYS = Object.freeze([
  "scout-auth-email-cooldown-until",
  "scout-vault-force-passphrase",
  "scholarship-scout-guest-session",
  "scholarship-scout.discovery-client-id",
]);

export const AUTH_STORAGE_KEY_MIGRATION = Object.freeze([
  { sourceKey: "scholarship-scout-auth", targetKey: "scholarship-scout-auth" },
  { sourceKey: "scholarship-scout-auth-code-verifier", targetKey: "scholarship-scout-auth-code-verifier" },
  { sourceKey: "sb-wjrwvempgjvoxlioodse-auth-token", targetKey: "scholarship-scout-auth" },
  { sourceKey: "sb-wjrwvempgjvoxlioodse-auth-token-code-verifier", targetKey: "scholarship-scout-auth-code-verifier" },
]);

export const APP_OWNED_LOCAL_STORAGE_KEYS = Object.freeze([
  ...PRIVATE_VAULT_RECORD_KEYS,
  ...UI_PREFERENCE_RECORD_KEYS,
  ...AUTH_STORAGE_KEY_MIGRATION.map(({ sourceKey }) => sourceKey),
  "scout-local-reliability",
  "scholarship-scout.legal-acceptance",
]);

export const APP_OWNED_SESSION_STORAGE_KEYS = SESSION_ONLY_RECORD_KEYS;

const privateRecordKeySet = new Set(PRIVATE_VAULT_RECORD_KEYS);
const uiPreferenceKeySet = new Set(UI_PREFERENCE_RECORD_KEYS);
const authStorageKeyMap = new Map(AUTH_STORAGE_KEY_MIGRATION.map(({ sourceKey, targetKey }) => [sourceKey, targetKey]));

export function isPrivateVaultRecordKey(key) {
  return typeof key === "string" && privateRecordKeySet.has(key);
}

export function isUiPreferenceRecordKey(key) {
  return typeof key === "string" && uiPreferenceKeySet.has(key);
}

export function getSecureAuthStorageKey(key) {
  return typeof key === "string" ? authStorageKeyMap.get(key) ?? null : null;
}
