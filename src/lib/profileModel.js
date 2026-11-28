export const CURRENT_PROFILE_VERSION = "profile-general-2026-11-v3";

export const LEGACY_PROFILE_KEYS = Object.freeze([
  "degreeGoal",
  "programNotes",
  "texasGrantNotation",
  "academicStrengths",
  "careerInterests",
  "awardsHonors",
  "preferredCollegeLocation",
  "enrollmentPlan",
]);

/**
 * Normalize saved profile data to the current allowlisted model.
 * Valid string values are preserved; newly added fields receive defaults.
 * Obsolete and unknown properties are not copied into the current profile.
 */
export function mergeProfileWithDefaults(saved, defaults, profileVersion = CURRENT_PROFILE_VERSION) {
  const prior = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  const merged = { ...defaults };

  for (const key of Object.keys(defaults)) {
    if (key === "profileVersion") continue;
    if (typeof prior[key] === "string") merged[key] = prior[key];
  }

  merged.profileVersion = profileVersion;
  return merged;
}
