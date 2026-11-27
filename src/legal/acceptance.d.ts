export const LEGAL_ACCEPTANCE_VERSION: string;
export const LEGAL_ACCEPTANCE_STORAGE_KEY: string;
export function isCurrentLegalAcceptance(rawValue: string | null | undefined): boolean;
export function createLegalAcceptanceRecord(
  acceptedAt?: string,
  options?: {
    ageGroup?: "adult" | "minor" | "under13" | "";
    guardianConfirmed?: boolean;
  },
): string;
