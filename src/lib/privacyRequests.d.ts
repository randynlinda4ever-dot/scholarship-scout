export const PRIVACY_REQUEST_RECIPIENT: string;
export const PRIVACY_REQUEST_TYPES: readonly { value: string; label: string }[];
export const PRIVACY_REQUESTER_TYPES: readonly { value: string; label: string }[];
export function buildPrivacyRequestMailto(options?: {
  requestType?: string;
  requesterType?: string;
  details?: string;
  contactEmail?: string;
  previousRequestReference?: string;
}): string;
