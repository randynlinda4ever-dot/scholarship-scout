const CORE_FIELDS = [
  {
    key: "state",
    label: "State of residence",
    reason: "State and local scholarship searches use this to narrow opportunities.",
  },
  {
    key: "grade",
    label: "Current education level",
    reason: "Some awards are limited to high-school students or graduating seniors.",
  },
  {
    key: "graduationYear",
    label: "Expected graduation year",
    reason: "Many scholarship cycles are restricted to a graduating class.",
  },
];

const SUPPORTING_FIELDS = [
  {
    key: "gpa",
    label: "GPA",
    reason: "Useful when a sponsor publishes a minimum GPA requirement.",
  },
  {
    key: "gpaType",
    label: "GPA scale or type",
    reason: "Helps interpret a reported GPA accurately.",
  },
  {
    key: "classRank",
    label: "Official class rank",
    reason: "Relevant when an award uses a class-rank cutoff.",
  },
  {
    key: "plannedMajor",
    label: "Intended major",
    reason: "Helps find awards associated with a field of study.",
  },
  {
    key: "activities",
    label: "Activities and leadership",
    reason: "Useful for awards that consider clubs, leadership, or organizations.",
  },
  {
    key: "service",
    label: "Community-service experience",
    reason: "Some awards consider volunteer experience or service hours.",
    alternateKey: "serviceHours",
  },
  {
    key: "employment",
    label: "Employment experience",
    reason: "Can help find employer-sponsored and work-experience awards.",
  },
  {
    key: "languages",
    label: "Languages",
    reason: "Can help find language-learning and language-achievement awards.",
  },
];

function hasValue(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function summarize(fields, profile) {
  const normalizedFields = fields.map((field) => ({
    key: field.key,
    label: field.label,
    reason: field.reason,
    complete: hasValue(profile[field.key]) ||
      (field.alternateKey ? hasValue(profile[field.alternateKey]) : false),
  }));
  const completedCount = normalizedFields.filter((field) => field.complete).length;
  const totalCount = normalizedFields.length;

  return {
    completedCount,
    totalCount,
    percent: totalCount ? Math.round((completedCount / totalCount) * 100) : 100,
    fields: normalizedFields,
    missing: normalizedFields.filter((field) => !field.complete),
  };
}

/**
 * Summarize profile coverage without turning optional information into
 * eligibility requirements. Citizenship, financial need, and memberships
 * are intentionally excluded and remain unknown until a sponsor rule is checked.
 */
export function getProfileReadiness(profile = {}) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile)
    ? profile
    : {};

  return {
    core: summarize(CORE_FIELDS, source),
    supporting: summarize(SUPPORTING_FIELDS, source),
  };
}
