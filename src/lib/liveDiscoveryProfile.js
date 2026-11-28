/**
 * Project only the two non-sensitive fields sent to public live discovery.
 * All school, academic, activity, contact, demographic, and household fields stay local.
 */
export function pickLiveDiscoveryProfile(profile = {}) {
  const rawGraduationYear =
    typeof profile.graduationYear === "string" || typeof profile.graduationYear === "number"
      ? String(profile.graduationYear).trim()
      : "";

  return {
    state: typeof profile.state === "string" ? profile.state.trim().slice(0, 60) : "",
    graduationYear: /^\d{4}$/.test(rawGraduationYear) ? rawGraduationYear : "",
  };
}
/**
 * Build the complete public discovery body. Keep the allowlist explicit here
 * so callers cannot spread a full student profile into the request.
 */
export function buildLiveDiscoveryPayload(profile = {}, categories = []) {
  const safeProfile = pickLiveDiscoveryProfile(profile);
  return {
    state: safeProfile.state,
    graduationYear: safeProfile.graduationYear,
    categories: Array.isArray(categories) ? categories.slice() : categories,
  };
}
