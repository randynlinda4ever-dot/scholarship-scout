import { isCountryCode, normalizeUsStateName } from "./profileLocations.js";

const CORE_BASE_FIELDS = [
  { key: "country", label: "Country of residence", reason: "Required to interpret location-based scholarship rules." },
  { key: "graduationYear", label: "Expected graduation year", reason: "Required to select the correct scholarship cycle." },
];

const US_STATE_FIELD = {
  key: "state",
  label: "State or territory of residence",
  reason: "Required for U.S. state and local scholarship research.",
};

const SUPPORTING_FIELDS = [
  { key: "county", label: "County", reason: "Used as a local location signal when ordering returned results." },
  { key: "school", label: "School name", reason: "Used only to order returned results on this device when a result names your school." },
  { key: "schoolState", label: "School location state", reason: "Compared when a sponsor restricts awards by current school location." },
  { key: "district", label: "School district", reason: "Compared when a sponsor restricts awards by school district." },
  { key: "plannedCollege", label: "Intended college or university", reason: "Compared when a sponsor names an eligible or excluded institution." },
  { key: "plannedCollegeState", label: "Intended college location state", reason: "Compared when a sponsor restricts awards by intended college location." },
  { key: "grade", label: "Current education level", reason: "Helps evaluate high-school and college enrollment requirements and order results." },
  { key: "age", label: "Age", reason: "Some sponsors publish an age range." },
  { key: "citizenship", label: "Citizenship or eligible status", reason: "Relevant only when the sponsor publishes a citizenship restriction." },
  { key: "gpa", label: "GPA", reason: "Compared when a sponsor publishes a minimum GPA requirement." },
  { key: "gpaType", label: "GPA scale or type", reason: "Helps interpret a reported GPA scale." },
  { key: "classRank", label: "Official class rank", reason: "Relevant when an award uses a class-rank cutoff." },
  { key: "act", label: "ACT composite", reason: "Compared when a sponsor publishes an ACT minimum." },
  { key: "sat", label: "SAT score", reason: "Compared when a sponsor publishes an SAT minimum." },
  { key: "plannedMajor", label: "Intended major", reason: "Compared with sponsor field-of-study rules and used to order results locally." },
  { key: "interests", label: "Academic and career interests", reason: "Compared with field-of-study rules and used to order results locally." },
  { key: "collegeStatus", label: "College enrollment status", reason: "Relevant when an award requires incoming, full-time, or part-time enrollment." },
  { key: "activities", label: "Activities and organization memberships", reason: "Checked when a sponsor specifies a membership requirement; also used for local result ordering." },
  { key: "serviceHours", label: "Community service hours", reason: "Compared with a sponsor's numeric minimum-hour requirement." },
  { key: "service", label: "Service and volunteer experience", reason: "Used only to order returned results on this device." },
  { key: "employment", label: "Employment experience", reason: "Used only to order returned results on this device." },
  { key: "languages", label: "Languages", reason: "Used only to order returned results on this device." },
  { key: "certifications", label: "Certifications", reason: "Used only to order returned results on this device." },
  { key: "academicHonors", label: "Academic honors", reason: "Used only to order returned results on this device." },
  { key: "apCourses", label: "AP coursework", reason: "Used only to order returned results on this device." },
  { key: "dualCreditCourses", label: "Dual-credit coursework", reason: "Used only to order returned results on this device." },
  { key: "searchKeywords", label: "Private result-ranking keywords", reason: "Compared with returned result titles and excerpts on this device only." },
  { key: "firstGeneration", label: "First-generation status", reason: "Only relevant when a sponsor defines this qualification." },
  { key: "shhMembershipStatus", label: "SHH membership", reason: "Used only for awards that require Sociedad Honoraria Hispanica membership." },
  { key: "spanishAchievementStatus", label: "Spanish achievement", reason: "Used only for awards that require a defined Spanish achievement." },
  { key: "nseMedalYears", label: "NSE/NPE medal years", reason: "Used only when a sponsor names specific exam medal years." },
  { key: "nseRegistered2027", label: "2026/27 NSE/NPE participation", reason: "Used only for awards that specify this exam cycle." },
  { key: "fourHMembershipStatus", label: "4-H membership", reason: "Used only for awards that require 4-H membership." },
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

export function getRequiredProfileErrors(profile = {}) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  const errors = [];
  const country = String(source.country ?? "").trim().toUpperCase();
  const state = String(source.state ?? "").trim();
  const year = String(source.graduationYear ?? "").trim();

  if (!country) {
    errors.push("Choose your country of residence.");
  } else if (!isCountryCode(country)) {
    errors.push("Choose a valid country of residence.");
  } else if (country === "US") {
    if (!state) errors.push("Choose your state or U.S. territory of residence.");
    else if (!normalizeUsStateName(state)) errors.push("Choose a valid U.S. state or territory of residence.");
  } else if (state) {
    errors.push("Clear the U.S. state field when your country of residence is not the United States.");
  }

  if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2100) {
    errors.push("Enter a valid four-digit expected graduation year.");
  }
  return errors;
}

export function getProfileReadiness(profile = {}) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  const country = String(source.country ?? "").trim().toUpperCase();
  const coreFields = [
    ...CORE_BASE_FIELDS.slice(0, 1),
    ...(country === "US" ? [US_STATE_FIELD] : []),
    CORE_BASE_FIELDS[1],
  ];
  const core = summarize(coreFields, source);
  const requiredErrors = getRequiredProfileErrors(source);
  return {
    core,
    supporting: summarize(SUPPORTING_FIELDS, source),
    requiredErrors,
    canSave: requiredErrors.length === 0,
  };
}
