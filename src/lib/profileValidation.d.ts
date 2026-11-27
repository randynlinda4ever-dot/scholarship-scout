export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate only profile fields changed by the user. Blank optional values are
 * accepted; invalid values return actionable messages.
 */
export function validateProfileChanges(
  previous?: Record<string, unknown>,
  next?: Record<string, unknown>,
): ProfileValidationResult;
