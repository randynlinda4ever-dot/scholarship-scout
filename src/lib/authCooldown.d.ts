export const AUTH_EMAIL_COOLDOWN_SECONDS: number;
export function getAuthCooldownRemainingSeconds(until: number, now?: number): number;
export function isAuthRateLimitError(error: unknown): boolean;
export function isExpiredAuthLinkError(code: unknown, description?: unknown): boolean;
