export const LEGAL_ACCEPTANCE_VERSION = "2026-11-28.8";
export const LEGAL_ACCEPTANCE_STORAGE_KEY = "scholarship-scout.legal-acceptance";

/**
 * A current receipt requires an explicit affirmative flag, the exact current
 * document version, and a parseable acceptance timestamp.
 */
export function isCurrentLegalAcceptance(rawValue) {
  if (typeof rawValue !== "string" || rawValue.length === 0) return false;

  try {
    const receipt = JSON.parse(rawValue);
    return Boolean(
      receipt &&
      typeof receipt === "object" &&
      !Array.isArray(receipt) &&
      receipt.accepted === true &&
      receipt.version === LEGAL_ACCEPTANCE_VERSION &&
      typeof receipt.acceptedAt === "string" &&
      Number.isFinite(Date.parse(receipt.acceptedAt)) &&
      (receipt.ageGroup === "adult" ||
        (receipt.ageGroup === "minor" && receipt.guardianConfirmed === true)),
    );
  } catch {
    return false;
  }
}

/**
 * The receipt deliberately contains no account identifier or student data.
 * It is local evidence of the browser's click, not a server-side identity,
 * age, or parental-consent verification record.
 */
export function createLegalAcceptanceRecord(
  acceptedAt = new Date().toISOString(),
  { ageGroup = "adult", guardianConfirmed = false } = {},
) {
  if (ageGroup !== "adult" && ageGroup !== "minor") {
    throw new Error("Scholarship Scout is not available to users under 13.");
  }
  if (ageGroup === "minor" && guardianConfirmed !== true) {
    throw new Error("A parent or legal guardian must review and permit use.");
  }
  return JSON.stringify({
    accepted: true,
    version: LEGAL_ACCEPTANCE_VERSION,
    acceptedAt,
    ageGroup,
    guardianConfirmed: ageGroup === "minor",
  });
}
