export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate changed profile fields, including ISO country, U.S. state, and citizenship selections.
 * Blank optional values remain accepted; invalid values return actionable messages.
 */
export function validateProfileChanges(
  previous?: Record<string, unknown>,
  next?: Record<string, unknown>,
): ProfileValidationResult;
