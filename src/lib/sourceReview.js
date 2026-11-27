const SOURCE_CRITICAL_FIELDS = [
  "name",
  "provider",
  "award",
  "awardEvidenceText",
  "awardEvidenceUrl",
  "awardCurrencyBasis",
  "awardBasis",
  "deadline",
  "deadlineText",
  "deadlineTimezone",
  "openDate",
  "openDateTimezone",
  "priorityDeadline",
  "priorityDeadlineText",
  "priorityDeadlineTimezone",
  "deadlineNotPublished",
  "sourceUrl",
  "evidenceUrl",
  "sourceAuthority",
  "evidenceText",
  "criteria",
  "criteriaEvidence",
];

const sameValue = (left, right) => {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const SOURCE_EVIDENCE_HISTORY_FIELDS = [
  "sourceUrl",
  "evidenceUrl",
  "evidenceText",
  "deadline",
  "deadlineText",
  "deadlineTimezone",
  "openDate",
  "openDateTimezone",
  "priorityDeadline",
  "priorityDeadlineText",
  "priorityDeadlineTimezone",
  "awardEvidenceText",
  "awardEvidenceUrl",
  "awardCurrencyBasis",
  "awardBasis",
  "criteriaEvidence",
  "sourceAuthority",
  "lastCheckedDate",
];
const MAX_SOURCE_EVIDENCE_HISTORY = 25;

/**
 * Retain the previous public-source evidence before a source URL or excerpt changes.
 * History is local tracker metadata and is deliberately excluded from cloud mapping.
 */
export function appendSourceEvidenceHistory(previous, updated, recordedAt = new Date().toISOString()) {
  const changed = SOURCE_EVIDENCE_HISTORY_FIELDS.some((field) =>
    !sameValue(previous?.[field], updated?.[field])
  );
  if (!changed) return updated;

  const snapshot = Object.fromEntries(SOURCE_EVIDENCE_HISTORY_FIELDS
    .filter((field) => previous?.[field] !== undefined)
    .map((field) => [field, previous[field]]));
  const hasPriorEvidence = ["sourceUrl", "evidenceUrl", "evidenceText", "awardEvidenceText", "awardEvidenceUrl"]
    .some((field) => typeof snapshot[field] === "string" && snapshot[field].trim().length > 0) ||
    (snapshot.criteriaEvidence && Object.keys(snapshot.criteriaEvidence).length > 0);
  if (!hasPriorEvidence) return updated;

  const existingHistory = Array.isArray(previous?.sourceEvidenceHistory)
    ? previous.sourceEvidenceHistory
    : Array.isArray(updated?.sourceEvidenceHistory) ? updated.sourceEvidenceHistory : [];
  const entry = { recordedAt, ...JSON.parse(JSON.stringify(snapshot)) };
  return {
    ...updated,
    sourceEvidenceHistory: [...existingHistory, entry].slice(-MAX_SOURCE_EVIDENCE_HISTORY),
  };
}

/**
 * A source review applies only to the source-critical record that was reviewed.
 * Unrelated tracker edits retain the existing review.
 */
export function invalidateSourceReviewIfChanged(previous, updated, explicitlyReviewed = false) {
  const changed = SOURCE_CRITICAL_FIELDS.some((field) =>
    !sameValue(previous?.[field], updated?.[field])
  );
  return changed && !explicitlyReviewed
    ? { ...updated, sourceVerified: false, lastCheckedDate: "" }
    : updated;
}
