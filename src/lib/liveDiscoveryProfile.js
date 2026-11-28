import { isLiveDiscoveryCategorySupported } from "./liveDiscoveryCapabilities.js";

/**
 * Project only the two non-sensitive fields sent to public live discovery.
 * All school, academic, activity, contact, demographic, and household fields stay local.
 */
export function pickLiveDiscoveryProfile(profile = {}) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile)
    ? profile
    : {};
  const rawGraduationYear =
    typeof source.graduationYear === "string" || typeof source.graduationYear === "number"
      ? String(source.graduationYear).trim()
      : "";

  return {
    state: typeof source.state === "string" ? source.state.trim().slice(0, 60) : "",
    graduationYear: /^\d{4}$/.test(rawGraduationYear) ? rawGraduationYear : "",
  };
}

/**
 * Build and validate the exact public discovery request body.
 * Student-profile properties are projected explicitly; no caller object is spread.
 * The Edge Function remains authoritative for validating state aliases and year range.
 */
export function buildLiveDiscoveryPayload(profile = {}, categories = []) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new TypeError("A student search profile is required.");
  }

  const rawState = typeof profile.state === "string" ? profile.state.trim() : "";
  if (!rawState || rawState.length > 60) {
    throw new TypeError("Choose a valid state before searching.");
  }

  const safeProfile = pickLiveDiscoveryProfile(profile);
  if (!/^\d{4}$/.test(safeProfile.graduationYear)) {
    throw new TypeError("Enter a four-digit graduation year before searching.");
  }

  if (!Array.isArray(categories) || categories.length === 0 || categories.length > 14) {
    throw new TypeError("Choose one or more supported scholarship search categories.");
  }
  if (new Set(categories).size !== categories.length ||
      categories.some((category) => !isLiveDiscoveryCategorySupported(category))) {
    throw new TypeError("Choose only supported, non-duplicated scholarship search categories.");
  }

  return {
    state: safeProfile.state,
    graduationYear: safeProfile.graduationYear,
    categories: categories.slice(),
  };
}
