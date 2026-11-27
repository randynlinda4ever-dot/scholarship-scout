import { normalizeUsStateName } from "./profileLocations.js";

const CORE_FIELDS = [
  { key: "state", label: "State or territory of residence", reason: "Required for U.S. state and local scholarship matching." },
  { key: "grade", label: "Current education level", reason: "Some awards are limited to high-school or college students." },
  { key: "graduationYear", label: "Expected graduation year", reason: "Scholarship cycles often depend on graduation class." },
];
const SUPPORTING_FIELDS = [
  { key: "gpa", label: "GPA", reason: "Useful when a sponsor publishes a minimum GPA requirement." },
  { key: "gpaType", label: "GPA scale or type", reason: "Helps interpret a reported GPA accurately." },
  { key: "classRank", label: "Official class rank", reason: "Relevant when an award uses a class-rank cutoff." },
  { key: "plannedMajor", label: "Intended major", reason: "Helps find awards associated with a field of study." },
  { key: "activities", label: "Activities and leadership", reason: "Useful for awards that consider clubs, leadership, or organizations." },
  { key: "service", label: "Community-service experience", reason: "Some awards consider volunteer experience or service hours.", alternateKey: "serviceHours" },
  { key: "employment", label: "Employment experience", reason: "Can help find employer-sponsored and work-experience awards." },
  { key: "languages", label: "Languages", reason: "Can help find language-learning and language-achievement awards." },
];
function hasValue(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}
function summarize(fields, profile) {
  const normalizedFields = fields.map((field) => ({
    key: field.key, label: field.label, reason: field.reason,
    complete: hasValue(profile[field.key]) || (field.alternateKey ? hasValue(profile[field.alternateKey]) : false),
  }));
  const completedCount = normalizedFields.filter((field) => field.complete).length;
  const totalCount = normalizedFields.length;
  return { completedCount, totalCount, percent: totalCount ? Math.round((completedCount / totalCount) * 100) : 100, fields: normalizedFields, missing: normalizedFields.filter((field) => !field.complete) };
}
export function getRequiredProfileErrors(profile = {}) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  const errors = [];
  const state = String(source.state ?? "").trim();
  if (!state) errors.push("Choose your state or U.S. territory of residence.");
  else if (!normalizeUsStateName(state)) errors.push("Choose a valid U.S. state or territory of residence.");
  if (!hasValue(source.grade)) errors.push("Choose your current education level.");
  const year = String(source.graduationYear ?? "").trim();
  if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2100) errors.push("Enter a valid four-digit expected graduation year.");
  return errors;
}
export function getProfileReadiness(profile = {}) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  const core = summarize(CORE_FIELDS, source);
  const requiredErrors = getRequiredProfileErrors(source);
  return { core, supporting: summarize(SUPPORTING_FIELDS, source), requiredErrors, canSave: requiredErrors.length === 0 };
}
