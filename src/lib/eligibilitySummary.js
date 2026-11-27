const VALID_OUTCOMES = new Set(["pass", "fail", "unknown"]);
const VALID_STATUSES = new Set([
  "Eligible",
  "Rules match — source unverified",
  "Needs information",
  "Ineligible",
  "Expired",
]);

export function summarizeEligibilityAssessment(assessment = {}) {
  const checks = Array.isArray(assessment?.checks)
    ? assessment.checks.filter((item) =>
      item && typeof item === "object" &&
      typeof item.label === "string" &&
      VALID_OUTCOMES.has(item.outcome),
    )
    : [];

  const preferred = checks.filter((item) => item.importance === "preferred");
  const mandatory = checks.filter((item) => item.importance !== "preferred");
  const passed = mandatory.filter((item) => item.outcome === "pass");
  const failed = mandatory.filter((item) => item.outcome === "fail");
  const unknown = mandatory.filter((item) => item.outcome === "unknown");
  const reportedStatus = VALID_STATUSES.has(assessment?.status)
    ? assessment.status
    : "Needs information";

  // Preferred outcomes are reported separately; only mandatory outcomes can
  // change the overall status. A preferred-only record is not enough to qualify.
  let status = reportedStatus;
  if (reportedStatus !== "Expired") {
    if (reportedStatus === "Ineligible" || failed.length > 0) {
      status = "Ineligible";
    } else if (
      reportedStatus === "Needs information" ||
      unknown.length > 0 ||
      mandatory.length === 0
    ) {
      status = "Needs information";
    }
  }

  let headline = "No structured checks available";
  if (checks.length === 0 && !VALID_STATUSES.has(assessment?.status)) {
    headline = "No structured checks available";
  } else if (status === "Expired") {
    headline = "Deadline has passed";
  } else if (status === "Ineligible") {
    headline = "One or more recorded requirements are not met";
  } else if (status === "Needs information") {
    headline = "More information needed";
  } else if (passed.length > 0 && failed.length === 0 && unknown.length === 0) {
    headline = preferred.length > 0
      ? "All mandatory requirements pass; preferred qualifications are informational"
      : "All recorded requirements pass";
  }

  return {
    status,
    passed,
    failed,
    unknown,
    preferred,
    headline,
    caveat: "This is a comparison of recorded rules, not an award guarantee. Sponsor decisions and requirements not recorded in Scout may still apply.",
  };
}
