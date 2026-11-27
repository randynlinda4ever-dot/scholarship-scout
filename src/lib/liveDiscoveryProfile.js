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
