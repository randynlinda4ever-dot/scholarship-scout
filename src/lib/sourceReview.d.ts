/**
 * Appends a local snapshot of previous public-source evidence when source URLs
 * or evidence excerpts change. Keeps the newest 25 revisions.
 */
export function appendSourceEvidenceHistory<P extends object, U extends object>(
  previous: P,
  updated: U,
  recordedAt?: string,
): U & { sourceEvidenceHistory?: Array<Record<string, unknown>> };

/**
 * Clears prior sponsor verification when reviewed source-critical fields change.
 * Unrelated tracker metadata edits preserve the existing review.
 */
export function invalidateSourceReviewIfChanged<P extends object, U extends object>(
  previous: P,
  updated: U,
  explicitlyReviewed?: boolean,
): U;
