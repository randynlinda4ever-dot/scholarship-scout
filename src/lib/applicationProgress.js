export const APPLICATION_CHECKLIST_STEPS = Object.freeze([
  "Review official eligibility rules and deadline",
  "Gather required transcript and academic information",
  "Identify recommendation letter requirements",
  "Read essay prompts and word limits",
  "Draft responses using your own experiences",
  "Review every field before personally submitting",
]);

const INVALID_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function normalizeApplicationProgress(value, validScholarshipIds, stepCount = APPLICATION_CHECKLIST_STEPS.length) {
  const normalized = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return normalized;

  const allowedIds = Array.isArray(validScholarshipIds) ? new Set(validScholarshipIds) : null;
  const safeStepCount = Number.isInteger(stepCount) && stepCount >= 0
    ? Math.min(stepCount, 50)
    : APPLICATION_CHECKLIST_STEPS.length;

  for (const [scholarshipId, savedSteps] of Object.entries(value).slice(0, 500)) {
    if (!scholarshipId || scholarshipId.length > 200 || INVALID_KEYS.has(scholarshipId)) continue;
    if (allowedIds && !allowedIds.has(scholarshipId)) continue;
    if (!Array.isArray(savedSteps)) continue;

    normalized[scholarshipId] = Array.from(
      { length: safeStepCount },
      (_, index) => savedSteps[index] === true,
    );
  }
  return normalized;
}

export function updateApplicationProgress(progress, scholarshipId, stepIndex, checked, stepCount = APPLICATION_CHECKLIST_STEPS.length) {
  const normalized = normalizeApplicationProgress(progress, undefined, stepCount);
  const safeStepCount = Number.isInteger(stepCount) && stepCount >= 0
    ? Math.min(stepCount, 50)
    : APPLICATION_CHECKLIST_STEPS.length;

  if (
    typeof scholarshipId !== "string" ||
    !scholarshipId ||
    scholarshipId.length > 200 ||
    INVALID_KEYS.has(scholarshipId) ||
    !Number.isInteger(stepIndex) ||
    stepIndex < 0 ||
    stepIndex >= safeStepCount ||
    typeof checked !== "boolean"
  ) return normalized;

  const current = normalized[scholarshipId] ?? Array(safeStepCount).fill(false);
  return {
    ...normalized,
    [scholarshipId]: current.map((value, index) => index === stepIndex ? checked : value),
  };
}

export function getApplicationProgressSummary(progress, scholarshipId, stepCount = APPLICATION_CHECKLIST_STEPS.length) {
  const normalized = normalizeApplicationProgress(progress, undefined, stepCount);
  const steps = normalized[scholarshipId] ?? Array(stepCount).fill(false);
  const completed = steps.filter(Boolean).length;
  const total = steps.length;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
