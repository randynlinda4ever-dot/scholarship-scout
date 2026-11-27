/**
 * Transparent rule-based scholarship matching.
 * Unknown inputs stay unknown; only documented matches count as passes.
 */
import { calendarDateKey, classifySourceAuthority, deriveSourceStatus, isSafeHttpsUrl, isSameOfficialSponsorSource } from "./lib/evidence.js";

const asNumber = (value, min = 0, max = Number.POSITIVE_INFINITY) => {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const text = String(value).trim();
  const validNumber = /^(?:\d+(?:\.\d+)?|[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?)$/;
  if (!validNumber.test(text)) return null;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const validThreshold = (value, min, max) => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const text = String(value).trim();
  const parsed = typeof value === "number" ? value : /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const CRITERION_KEYS_BY_LABEL = {
  "State residency": "state",
  "School location state": "schoolState",
  "Intended college location state": "collegeState",
  "School district": "district",
  "Age range": "ageRange",
  "SHH membership": "requiresShhMembership",
  "Spanish achievement": "requiresSpanishAchievement",
  "NSE/NPE 2026/27 participation": "requiresNseRegistration2027",
  "4-H membership": "requiresFourHMembership",
  "Standardized test score": "requiresTestScore",
  "Citizenship": "citizenship",
  "Eligible noncitizen status": "citizenship",
  "Education level": "educationLevel",
  "Incoming college plan": "educationLevel",
  "Graduation year": "graduationYear",
  "Minimum GPA": "minGpa",
  "Class rank": "topPercentMax",
  "ACT minimum": "minAct",
  "SAT minimum": "minSat",
  "ACT or SAT threshold": "minActOrSat",
  "Field of study": "majorKeywords",
  "College destination": "institution",
  "Full-time enrollment": "requiresFullTimeEnrollment",
  "Enrollment status alternatives": "enrollmentStatuses",
  "Community service": "minServiceHours",
  "Organization membership": "requiredMembership",
  "Financial need": "requiresFinancialNeed",
  "First-generation status": "requiresFirstGeneration",
  "Additional sponsor requirements": "otherRequirement",
};
const norm = (value) => String(value ?? "").trim().toLowerCase();
const fieldTokens = (value) => norm(value).match(/[\p{L}\p{N}]+/gu) ?? [];
const containsKeywordPhrase = (text, keyword) => {
  const words = fieldTokens(text);
  const phrase = fieldTokens(keyword);
  if (!phrase.length || phrase.length > words.length) return false;
  return words.some((_, start) =>
    phrase.every((word, offset) => words[start + offset] === word)
  );
};
const isSafeEvidenceUrl = isSafeHttpsUrl;

const isValidDateOnly = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isExplicitNo = (value) => /^(?:no|nope|none)\b/.test(norm(value));

const numericHighSchoolGrade = (grade) =>
  /\b(?:grade\s*)?(9|10|11|12)(?:th)?(?:\s*grade)?\b/.exec(grade)?.[1] ?? null;

const isHighSchoolSenior = (grade) =>
  !/\bcollege\b/.test(grade) && (
    /\bhigh[\s-]?school\b.*\bsenior\b|\bsenior\b.*\bhigh[\s-]?school\b/.test(grade) ||
    numericHighSchoolGrade(grade) === "12"
  );

const isHighSchoolStudent = (grade) =>
  !/\bcollege\b/.test(grade) &&
  (/\bhigh[\s-]?school\b/.test(grade) || numericHighSchoolGrade(grade) !== null);

const isUndergraduate = (grade) =>
  grade.includes("undergraduate") ||
  /\bcollege student\b/.test(grade) ||
  /\bcollege\b.*\b(?:freshman|sophomore|junior|senior)\b/.test(grade) ||
  /\b(?:freshman|sophomore|junior|senior)\b.*\bcollege\b/.test(grade);

const isAmbiguousEducationLabel = (grade) =>
  /\bclass\s+of\s+(?:['’]?\d{2}|\d{4})\b/.test(grade) ||
  /^(?:freshman|first[- ]year|sophomore|second[- ]year|junior|third[- ]year|senior|fourth[- ]year)$/.test(grade);

export function profileRankPercent(profile) {
  const classRank = String(profile.classRank ?? "");
  // A rank fraction is more precise than an accompanying rounded band such as "top 10%".
  const ratio = classRank.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
  if (ratio && Number(ratio[2]) > 0) return (Number(ratio[1]) / Number(ratio[2])) * 100;
  const explicit = classRank.match(/(\d+(?:\.\d+)?)\s*%/);
  if (explicit) return Number(explicit[1]);
  return null;
}
export function assessEligibility(scholarship, profile, now = new Date()) {
  const criteria = scholarship.criteria ?? {};
  const checks = [];
  const addCheck = (label, outcome, detail) => {
    const criterionKey = label.startsWith("NSE/NPE medal — ")
      ? "requiredNseMedalYears"
      : CRITERION_KEYS_BY_LABEL[label];
    const entry = criterionKey && scholarship.criteriaEvidence &&
      typeof scholarship.criteriaEvidence === "object"
      ? scholarship.criteriaEvidence[criterionKey]
      : null;
    const excerpt = typeof entry?.excerpt === "string" ? entry.excerpt.trim().slice(0, 1000) : "";
    const candidateSourceUrl = typeof entry?.sourceUrl === "string" ? entry.sourceUrl.trim() : "";
    const sourceUrl = isSafeEvidenceUrl(candidateSourceUrl) ? candidateSourceUrl : "";
    const sponsorUrl = typeof scholarship.sourceUrl === "string" ? scholarship.sourceUrl.trim() : "";
    const hasTraceableEvidence = Boolean(
      excerpt && sourceUrl && isSameOfficialSponsorSource(sponsorUrl, sourceUrl)
    );
    const evidenceMissing = Boolean(criterionKey && !hasTraceableEvidence);
    const importance = criterionKey && scholarship.criteriaImportance?.[criterionKey] === "preferred"
      ? "preferred"
      : "mandatory";
    checks.push({
      label,
      importance,
      outcome: evidenceMissing ? "unknown" : outcome,
      detail: evidenceMissing
        ? `${detail} Criterion-specific evidence from the same recognized official sponsor domain is missing or invalid, so this requirement cannot be scored yet.`
        : detail,
      ...(criterionKey ? {
        criterionKey,
        evidence: hasTraceableEvidence
          ? { state: "linked", excerpt, sourceUrl }
          : { state: "unknown", excerpt: "", sourceUrl: "" },
      } : {}),
    });
  };
  const fail = (label, detail) => addCheck(label, "fail", detail);
  const pass = (label, detail) => addCheck(label, "pass", detail);
  const unknown = (label, detail) => addCheck(label, "unknown", detail);

  if (criteria.state) {
    const state = norm(profile.state);
    if (!state) unknown("State residency", "State of residence is not recorded.");
    else if (state === norm(criteria.state)) pass("State residency", `Profile state is ${profile.state}.`);
    else fail("State residency", `Requires ${criteria.state}; profile lists ${profile.state}.`);
  }

  if (criteria.schoolState) {
    const schoolState = norm(profile.schoolState);
    if (!schoolState) unknown("School location state", "The state where the current school is located is not recorded.");
    else if (schoolState === norm(criteria.schoolState)) pass("School location state", `Current school location is ${profile.schoolState}.`);
    else fail("School location state", `Requires a school located in ${criteria.schoolState}; profile lists ${profile.schoolState}.`);
  }

  if (criteria.collegeState) {
    const collegeState = norm(profile.plannedCollegeState);
    if (!collegeState) unknown("Intended college location state", "The state of the intended college destination is not recorded.");
    else if (collegeState === norm(criteria.collegeState)) pass("Intended college location state", `Intended college location is ${profile.plannedCollegeState}.`);
    else fail("Intended college location state", `Requires an intended college in ${criteria.collegeState}; profile lists ${profile.plannedCollegeState}.`);
  }

  if (criteria.district) {
    const district = norm(profile.district);
    if (!district) unknown("School district", "School district is not recorded.");
    else if (district === norm(criteria.district)) pass("School district", `Profile lists ${profile.district}.`);
    else fail("School district", `Requires ${criteria.district}; profile lists ${profile.district}.`);
  }

  if (criteria.ageRange && typeof criteria.ageRange === "object" && !Array.isArray(criteria.ageRange)) {
    const range = criteria.ageRange;
    const hasMin = range.min !== undefined && range.min !== null && range.min !== "";
    const hasMax = range.max !== undefined && range.max !== null && range.max !== "";
    const validMin = !hasMin || (Number.isInteger(range.min) && range.min >= 0 && range.min <= 120 && typeof range.minInclusive === "boolean");
    const validMax = !hasMax || (Number.isInteger(range.max) && range.max >= 0 && range.max <= 120 && typeof range.maxInclusive === "boolean");
    const ordered = !hasMin || !hasMax || range.min < range.max ||
      (range.min === range.max && range.minInclusive === true && range.maxInclusive === true);
    if ((!hasMin && !hasMax) || !validMin || !validMax || !ordered) {
      unknown("Age range", "The sponsor's age boundary is incomplete or invalid. Confirm each stated limit and whether it includes the boundary age.");
    } else {
      const ageText = String(profile.age ?? "").trim();
      const age = /^(?:0|[1-9]\d{0,2})$/.test(ageText) ? Number(ageText) : null;
      if (age === null || age > 120) {
        unknown("Age range", "Applicant age is not recorded as a whole number from 0 through 120.");
      } else {
        const belowMinimum = hasMin && (age < range.min || (age === range.min && !range.minInclusive));
        const aboveMaximum = hasMax && (age > range.max || (age === range.max && !range.maxInclusive));
        if (belowMinimum) fail("Age range", `Applicant age ${age} does not satisfy the sponsor's ${range.minInclusive ? "inclusive" : "exclusive"} minimum of ${range.min}.`);
        else if (aboveMaximum) fail("Age range", `Applicant age ${age} does not satisfy the sponsor's ${range.maxInclusive ? "inclusive" : "exclusive"} maximum of ${range.max}.`);
        else pass("Age range", `Applicant age ${age} satisfies the recorded sponsor age limit.`);
      }
    }
  }

  if (criteria.requiresShhMembership) {
    const status = norm(profile.shhMembershipStatus);
    if (status.startsWith("confirmed") || status.startsWith("yes")) pass("SHH membership", "Profile marks Sociedad Honoraria Hispánica membership as confirmed; chapter sponsor should still confirm eligibility for this award.");
    else if (isExplicitNo(status)) fail("SHH membership", "Profile indicates no SHH membership.");
    else unknown("SHH membership", "Membership is reported or unconfirmed; the chapter sponsor must verify active initiation and current chapter standing.");  }

  if (criteria.requiresSpanishAchievement) {
    const status = norm(profile.spanishAchievementStatus);
    if (status.startsWith("confirmed") || status.startsWith("yes")) pass("Spanish achievement", "Profile marks the required Spanish/Portuguese achievement as confirmed.");
    else if (isExplicitNo(status)) fail("Spanish achievement", "Profile indicates the sponsor's required Spanish/Portuguese achievement is not met.");
    else unknown("Spanish achievement", "Transcript courses are recorded, but the SHH sponsor must decide whether they demonstrate the high achievement required by the award.");
  }

  if (criteria.requiredNseMedalYears?.length) {
    const medalText = norm(profile.nseMedalYears);
    const explicitlyUnknown = !medalText || /not recorded|unknown|unsure|confirm/i.test(medalText);
    const explicitlyNone = /no medals|none|no nse|no npe/i.test(medalText);
    const recordedYears = explicitlyUnknown || explicitlyNone ? [] : medalText.match(/20\d{2}/g) ?? [];
    for (const year of criteria.requiredNseMedalYears) {
      if (explicitlyUnknown) unknown(`NSE/NPE medal — ${year}`, `No confirmed medal record for ${year} is stored.`);
      else if (explicitlyNone) fail(`NSE/NPE medal — ${year}`, `Profile records no NSE/NPE medals.`);
      else if (recordedYears.includes(String(year))) pass(`NSE/NPE medal — ${year}`, `Profile records an NSE/NPE medal for ${year}; verify the result against the official score record.`);
      else fail(`NSE/NPE medal — ${year}`, `The recorded medal years do not include ${year}.`);
    }
  }

  if (criteria.requiresNseRegistration2027) {
    const status = norm(profile.nseRegistered2027);
    if (status.startsWith("yes") || status.startsWith("confirmed")) pass("NSE/NPE 2026/27 participation", "Profile marks participation during the 2026/27 exam year as confirmed; verify with the exam administrator.");
    else if (isExplicitNo(status)) fail("NSE/NPE 2026/27 participation", "Profile indicates no NSE/NPE participation during 2026/27.");
    else unknown("NSE/NPE 2026/27 participation", "Participation in the 2026/27 NSE/NPE is not confirmed.");
  }

  if (criteria.requiresFourHMembership) {
    const status = norm(profile.fourHMembershipStatus);
    if (status.startsWith("yes") || status.startsWith("confirmed")) pass("4-H membership", "Profile marks 4-H membership as confirmed.");
    else if (isExplicitNo(status)) fail("4-H membership", "Profile indicates no 4-H membership.");
    else unknown("4-H membership", "4-H membership and any required years of participation have not been confirmed.");
  }

  if (criteria.requiresTestScore) {
    const hasAct = String(profile.act ?? "").match(/\d+/);
    const hasSat = String(profile.sat ?? "").match(/\d+/);
    hasAct || hasSat
      ? pass("Standardized test score", "An ACT or SAT score is recorded; confirm the sponsor accepts the score type and test date.")
      : unknown("Standardized test score", "The scholarship requires a standardized test score, but none is recorded.");
  }

  if (criteria.citizenship === "us-citizen") {
    const citizenship = norm(profile.citizenship).replace(/[._-]+/g, " ").replace(/\s+/g, " ");
    const explicitlyNonCitizen = /\bnon\s*citizen\b/.test(citizenship) ||
      /\bnot\b.{0,32}\b(?:citizen|national)\b/.test(citizenship);
    const explicitlyUsCitizen = /\b(?:u\s+s|us)\s+(?:citizen|national)\b/.test(citizenship);
    if (explicitlyUsCitizen && !explicitlyNonCitizen) pass("Citizenship", "Profile records U.S. citizen or U.S. national.");
    else if (!citizenship || (!explicitlyNonCitizen && !explicitlyUsCitizen)) unknown("Citizenship", "Citizenship status needs confirmation; only an explicit U.S. citizen or U.S. national statement can satisfy this rule.");
    else fail("Citizenship", "The profile explicitly records a non-citizen status, which does not meet a U.S.-citizen requirement.");
  } else if (criteria.citizenship === "eligible-noncitizen") {
    const citizenship = norm(profile.citizenship).replace(/[._-]+/g, " ").replace(/\s+/g, " ");
    const explicitlyNonCitizen = /\bnon\s*citizen\b/.test(citizenship) ||
      /\bnot\b.{0,32}\b(?:citizen|national)\b/.test(citizenship);
    const explicitlyUsCitizen = /\b(?:u\s+s|us)\s+(?:citizen|national)\b/.test(citizenship) &&
      !explicitlyNonCitizen;
    if (/\beligible\s+non\s*citizen\b/.test(citizenship)) pass("Eligible noncitizen status", "Profile records eligible noncitizen status.");
    else if (explicitlyUsCitizen) fail("Eligible noncitizen status", "The profile explicitly records U.S. citizenship, which is not the eligible-noncitizen category.");
    else unknown("Eligible noncitizen status", "A non-citizen description does not establish a sponsor-approved eligible-noncitizen category. Confirm the exact immigration category with the sponsor.");
  }

  if (criteria.educationLevel) {
    const grade = norm(profile.grade);
    const ambiguousLabel = isAmbiguousEducationLabel(grade);
    const highSchoolStudent = isHighSchoolStudent(grade);
    const undergraduate = isUndergraduate(grade);
    if (!grade) {
      unknown("Education level", "Current education level is not recorded.");
    } else if (criteria.educationLevel === "high-school-senior") {
      if (isHighSchoolSenior(grade)) {
        pass("Education level", "Profile is explicitly recorded as a high-school senior or grade 12.");
      } else if (undergraduate || highSchoolStudent) {
        fail("Education level", "This award requires a high-school senior; the recorded education level identifies a different level.");
      } else if (ambiguousLabel) {
        unknown("Education level", "The recorded class-year label does not identify whether the student is in high school or college.");
      } else {
        fail("Education level", "This award requires a high-school senior.");
      }
    } else if (criteria.educationLevel === "high-school-student") {
      if (highSchoolStudent) {
        pass("Education level", "Profile is explicitly recorded as a current high-school student.");
      } else if (undergraduate) {
        fail("Education level", "This award requires a current high-school student; the profile identifies college enrollment.");
      } else if (ambiguousLabel) {
        unknown("Education level", "The recorded class-year label does not identify whether the student is in high school or college.");
      } else {
        fail("Education level", "This award requires a current high-school student.");
      }
    } else if (criteria.educationLevel === "incoming-college") {
      isHighSchoolSenior(grade) && norm(profile.collegeStatus).includes("planned")
        ? pass("Incoming college plan", "A college destination is recorded as planned; actual enrollment is not yet confirmed.")
        : unknown("Incoming college plan", "Confirm that you will enroll in college for the required term.");
    } else if (criteria.educationLevel === "undergraduate") {
      if (undergraduate) {
        pass("Education level", "Profile explicitly records current undergraduate enrollment.");
      } else if (highSchoolStudent) {
        fail("Education level", "This award requires a currently enrolled undergraduate; the profile identifies high-school enrollment.");
      } else if (ambiguousLabel) {        unknown("Education level", "The recorded class-year label does not identify whether the student is in high school or college.");
      } else {
        fail("Education level", "This award requires a currently enrolled undergraduate.");
      }
    }
  }

  if (criteria.graduationYear !== undefined && criteria.graduationYear !== null && criteria.graduationYear !== "") {
    const graduationYear = String(profile.graduationYear ?? "").trim();
    if (!/^\d{4}$/.test(graduationYear)) {
      unknown("Graduation year", "Expected graduation year is not recorded as a four-digit calendar year.");
    } else if (Number(graduationYear) === Number(criteria.graduationYear)) {
      pass("Graduation year", `Profile graduation year is ${graduationYear}.`);
    } else {
      fail("Graduation year", `Requires class of ${criteria.graduationYear}; profile lists ${graduationYear}.`);
    }
  }

  if (criteria.minGpa !== undefined && criteria.minGpa !== null && criteria.minGpa !== "") {
    const gpa = asNumber(profile.gpa, 0, 5);
    const minimum = validThreshold(criteria.minGpa, 0, 5);
    if (minimum === null) unknown("Minimum GPA", "The sponsor's GPA threshold is missing, malformed, or outside the supported 0–5 range; confirm the source rule.");
    else if (gpa === null) unknown("Minimum GPA", "A comparable GPA value is not recorded.");
    else gpa >= minimum ? pass("Minimum GPA", gpa.toFixed(3) + " meets the " + minimum + " minimum.") : fail("Minimum GPA", gpa.toFixed(3) + " is below the " + minimum + " minimum.");
  }

  if (criteria.topPercentMax !== undefined && criteria.topPercentMax !== null && criteria.topPercentMax !== "") {
    const rank = profileRankPercent(profile);
    const maximum = validThreshold(criteria.topPercentMax, 0, 100);
    if (maximum === null) unknown("Class rank", "The sponsor's class-rank cutoff is malformed or outside the 0–100% range.");
    else if (rank === null) unknown("Class rank", "A documented rank percentage is not available.");
    else rank <= maximum ? pass("Class rank", "Top " + rank.toFixed(2) + "% meets the top " + maximum + "% cutoff.") : fail("Class rank", "Top " + rank.toFixed(2) + "% does not meet the top " + maximum + "% cutoff.");
  }

  for (const [key, label, minimumAllowed, maximumAllowed] of [["minAct", "ACT minimum", 1, 36], ["minSat", "SAT minimum", 400, 1600]]) {
    const rawMinimum = criteria[key];
    if (rawMinimum !== undefined && rawMinimum !== null && rawMinimum !== "") {
      const minimum = validThreshold(rawMinimum, minimumAllowed, maximumAllowed);
      const score = key === "minAct"
        ? asNumber(profile.act, 1, 36)
        : asNumber(profile.sat, 400, 1600);
      if (minimum === null) unknown(label, "The sponsor's " + (key === "minAct" ? "ACT" : "SAT") + " threshold is malformed or outside the supported score range.");
      else if (score === null) unknown(label, "A comparable test score is not recorded.");
      else score >= minimum ? pass(label, score + " meets the " + minimum + " minimum.") : fail(label, score + " is below the " + minimum + " minimum.");
    }
  }

  if (criteria.minActOrSat) {
    const act = asNumber(profile.act, 1, 36);
    const sat = asNumber(profile.sat, 400, 1600);
    const rawActMinimum = criteria.minActOrSat.act ?? null;
    const rawSatMinimum = criteria.minActOrSat.sat ?? null;
    const actMinimum = validThreshold(rawActMinimum, 1, 36);
    const satMinimum = validThreshold(rawSatMinimum, 400, 1600);
    const hasActRoute = rawActMinimum !== null && rawActMinimum !== "";
    const hasSatRoute = rawSatMinimum !== null && rawSatMinimum !== "";
    const invalidRoute = (hasActRoute && actMinimum === null) || (hasSatRoute && satMinimum === null);
    const actPass = act !== null && actMinimum !== null && act >= actMinimum;
    const satPass = sat !== null && satMinimum !== null && sat >= satMinimum;
    if (actPass || satPass) {
      const matched = [actPass ? "ACT " + act + " (minimum " + actMinimum + ")" : null, satPass ? "SAT " + sat + " (minimum " + satMinimum + ")" : null].filter(Boolean);
      pass("ACT or SAT threshold", "Meets at least one permitted score route: " + matched.join("; ") + ".");
    } else if (!hasActRoute && !hasSatRoute) {
      unknown("ACT or SAT threshold", "No valid ACT or SAT threshold is recorded for this alternative requirement.");
    } else if (invalidRoute || (actMinimum !== null && act === null) || (satMinimum !== null && sat === null)) {
      unknown("ACT or SAT threshold", "At least one permitted ACT or SAT route has an invalid threshold or lacks a comparable recorded score; confirm the unresolved alternative.");
    } else {
      fail("ACT or SAT threshold", "Every valid recorded permitted test-score route is below its stated threshold.");
    }
  }

  if (criteria.majorKeywords?.length) {
    const academicText = norm([profile.plannedMajor, profile.interests].filter(Boolean).join(" "));
    if (!academicText) {
      unknown("Field of study", "Planned major and academic interests are not recorded.");
    } else {
      const matching = criteria.majorKeywords.filter((keyword) => containsKeywordPhrase(academicText, keyword));
      matching.length
        ? pass("Field of study", `Matches: ${matching.join(", ")}.`)
        : fail("Field of study", `No listed field keyword matches the planned major or interests: ${criteria.majorKeywords.join(", ")}.`);
    }
  }

  if (criteria.institution) {
    const plannedCollege = norm(profile.plannedCollege);
    if (!plannedCollege) unknown("College destination", "A planned college destination is not recorded.");
    else if (containsKeywordPhrase(plannedCollege, criteria.institution)) {
      pass("College destination", `Planned destination matches ${criteria.institution}; admission/enrollment is not confirmed.`);
    } else {
      fail("College destination", `Requires ${criteria.institution}; profile lists ${profile.plannedCollege}.`);
    }
  }

  if (criteria.requiresFullTimeEnrollment) {
    const status = norm(profile.collegeStatus);
    const explicitlyFullTime = /\bfull[\s-]?time\b/.test(status);
    const explicitlyNotFullTime = /\b(?:part[\s-]?time|not\s+(?:currently\s+)?full[\s-]?time|no\s+full[\s-]?time)\b/.test(status);
    if (explicitlyFullTime && !explicitlyNotFullTime && !/\b(?:planned|pending|unconfirmed|not confirmed)\b/.test(status)) {
      pass("Full-time enrollment", "Profile explicitly records full-time enrollment; verify the sponsor’s required credit load.");
    } else if (explicitlyNotFullTime) {
      fail("Full-time enrollment", "The recorded enrollment status is not full-time.");
    } else {      unknown("Full-time enrollment", "Full-time enrollment is not explicitly confirmed in the profile.");
    }
  }

  if (criteria.enrollmentStatuses?.length) {
    const status = norm(profile.collegeStatus);
    const grade = norm(profile.grade);
    const highSchoolStudent = isHighSchoolStudent(grade);
    const highSchoolSenior = isHighSchoolSenior(grade);
    const undergraduate = isUndergraduate(grade);
    const explicitlyNotEnrolled = /\b(?:not enrolled|no longer enrolled|not a student)\b/.test(status);
    const outcomes = criteria.enrollmentStatuses.map((alternative) => {
      if (alternative === "full-time" || alternative === "part-time") {
        const isFullTime = alternative === "full-time";

        const explicitlyMatches = isFullTime ? /\bfull[\s-]?time\b/.test(status) : /\bpart[\s-]?time\b/.test(status);
        const explicitlyOpposite = isFullTime ? /\bpart[\s-]?time\b/.test(status) : /\bfull[\s-]?time\b/.test(status);
        const explicitlyNegated = isFullTime ? /\bnot\s+(?:currently\s+)?full[\s-]?time\b/.test(status) : /\bnot\s+(?:currently\s+)?part[\s-]?time\b/.test(status);
        if (explicitlyMatches && !explicitlyNegated && !/\b(?:planned|pending|unconfirmed|not confirmed)\b/.test(status)) return "pass";
        if (explicitlyOpposite || explicitlyNegated || explicitlyNotEnrolled) return "fail";
        return "unknown";
      }
      if (alternative === "incoming") {
        if (undergraduate || (highSchoolStudent && !highSchoolSenior)) return "fail";
        if (highSchoolSenior && /\b(?:planned|incoming)\b/.test(status) && !/\bnot\s+(?:planned|incoming)\b/.test(status)) return "pass";
        if (explicitlyNotEnrolled || /\bnot\s+(?:planned|incoming)\b/.test(status)) return "fail";
        return "unknown";
      }
      if (alternative === "current-student") {
        if (explicitlyNotEnrolled) return "fail";
        if (highSchoolStudent || undergraduate) return "pass";
        return "unknown";
      }
      return "unknown";
    });
    if (outcomes.includes("pass")) {
      const matched = criteria.enrollmentStatuses.filter((_, index) => outcomes[index] === "pass");
      pass("Enrollment status alternatives", `At least one sponsor-accepted enrollment route is supported by the profile: ${matched.join(", ")}.`);
    } else if (outcomes.every((outcome) => outcome === "fail")) {
      fail("Enrollment status alternatives", "The profile explicitly rules out every recorded enrollment route.");
    } else {
      const unresolved = criteria.enrollmentStatuses.filter((_, index) => outcomes[index] === "unknown");
      unknown("Enrollment status alternatives", `No enrollment route is confirmed yet. These alternatives still need clarification: ${unresolved.join(", ")}.`);
    }
  }

  if (criteria.minServiceHours !== undefined && criteria.minServiceHours !== null && criteria.minServiceHours !== "") {
    const requiredHours = validThreshold(criteria.minServiceHours, 0, 1_000_000);
    const hours = asNumber(profile.serviceHours, 0, 1000000);
    if (requiredHours === null) {
      unknown("Community service", "The sponsor's service-hour minimum is invalid; confirm it on the official page.");
    } else if (hours === null) {
      unknown("Community service", "Service hours are missing or are not a valid non-negative number.");
    } else if (hours >= requiredHours) {
      pass("Community service", `${hours}+ hours meets the ${requiredHours}-hour minimum.`);
    } else {
      fail("Community service", `${hours} hours is below the ${requiredHours}-hour minimum.`);
    }
  }

  if (criteria.requiredMembership) {
    const activityText = norm(profile.activities);
    const hasMembership = containsKeywordPhrase(activityText, criteria.requiredMembership);
    const explicitlyLacksGoodStanding = /\b(?:not|no longer|without)\s+(?:\w+\s+){0,3}good standing\b/.test(activityText);
    if (hasMembership && explicitlyLacksGoodStanding) {
      unknown("Organization membership", `The profile records ${criteria.requiredMembership}, but also indicates that good standing is not met; confirm the sponsor's current membership rules.`);
    } else if (hasMembership && containsKeywordPhrase(activityText, "good standing")) {
      pass("Organization membership", `Profile notes ${criteria.requiredMembership} membership in good standing; confirm any chapter-specific sponsor rules.`);
    } else if (hasMembership) {
      unknown("Organization membership", `The profile lists ${criteria.requiredMembership}; confirm active membership and good standing if required.`);
    } else {
      unknown("Organization membership", `Confirm whether you belong to ${criteria.requiredMembership} and meet the sponsor's membership rules.`);
    }
  }

  if (criteria.requiresFinancialNeed) unknown("Financial need", "Needs-based qualification cannot be inferred from the matching profile. Review the sponsor's exact definition and required financial-aid documents.");
  if (criteria.requiresFirstGeneration) {
    const firstGen = norm(profile.firstGeneration);
    if (firstGen.startsWith("yes")) pass("First-generation status", "Profile marks first-generation status as confirmed; compare it with the sponsor's definition.");
    else if (isExplicitNo(firstGen)) fail("First-generation status", "Profile indicates that the first-generation requirement is not met.");
    else unknown("First-generation status", "First-generation status is not confirmed; sponsor definitions differ.");
  }
  if (criteria.otherRequirement) unknown("Additional sponsor requirements", criteria.otherRequirement);

  const sourceAuthority = scholarship.sourceAuthority || classifySourceAuthority(scholarship.sourceUrl);
  const sourceStatus = deriveSourceStatus({ ...scholarship, sourceAuthority }, now);
  const sourceVerified = sourceStatus === "verified";

  const riskFlags = [];
  const hasMandatoryCriteria = Object.entries(criteria).some(([key, value]) => {
    const normalizedString = typeof value === "string" ? value.trim().toLowerCase() : null;
    const inactiveValue = normalizedString === "" || normalizedString === "any" || value === false;
    return key !== "applicationFee" &&
      scholarship.criteriaImportance?.[key] !== "preferred" &&
      value !== undefined && value !== null && !inactiveValue &&
      (!Array.isArray(value) || value.length > 0);
  });
  if (!hasMandatoryCriteria) unknown("Mandatory eligibility criteria", "No mandatory sponsor requirements have been recorded. Preferred qualifications alone cannot establish eligibility.");
  if (criteria.applicationFee === true) riskFlags.push("The listing indicates an application fee. Treat this as a serious warning and verify directly with the sponsor; the FTC advises never paying to apply for a scholarship.");
  if (!scholarship.sourceUrl) unknown("Official source", "Add the sponsor's official scholarship page.");
  if (!sourceVerified) unknown("Official source verification", "The source has not passed the official-host, HTTPS, sponsor-detail, award, deadline, evidence, and freshness checks. A manually selected review flag is not enough.");
  if (sourceVerified && !String(scholarship.evidenceText ?? "").trim()) unknown("Evidence excerpt", "Add a short excerpt or note from the official rules to support the verification.");

  const openDateValue = String(scholarship.openDate ?? "").trim();
  const validOpenDate = !openDateValue || isValidDateOnly(openDateValue);
  const openDateTimezone = String(scholarship.openDateTimezone ?? "").trim();
  const currentOpenDate = validOpenDate && openDateValue ? calendarDateKey(now, openDateTimezone) : null;
  if (openDateValue && !validOpenDate) {
    unknown("Application opening date", "The recorded opening date is not a valid calendar date. Confirm it from the sponsor's current rules.");
  } else if (openDateValue && openDateTimezone && !currentOpenDate) {
    unknown("Application opening date", "The sponsor-stated opening time zone is not recognized. Confirm its IANA identifier; opening status remains unknown.");  }
  const openingStatusUnknown = Boolean(openDateValue && (!validOpenDate || (openDateTimezone && !currentOpenDate)));
  const isNotYetOpen = Boolean(openDateValue && validOpenDate && currentOpenDate && openDateValue > currentOpenDate);
  if (isNotYetOpen) unknown("Application opening date", "The sponsor-confirmed application opening date has not arrived. This opportunity is not open yet; eligibility cannot be finalized.");

  const deadlineValue = scholarship.deadline;
  const validDeadline = isValidDateOnly(deadlineValue);
  if (deadlineValue && !validDeadline) {
    unknown("Deadline format", "The recorded deadline is not a valid calendar date (YYYY-MM-DD). Confirm it against the sponsor's official rules before relying on expiry or eligibility.");
  }
  const openingRangeInvalid = Boolean(validDeadline && validOpenDate && openDateValue && deadlineValue < openDateValue);
  if (openingRangeInvalid) unknown("Application date range", "The recorded final deadline is earlier than the application opening date. Confirm the current cycle's date range with the sponsor.");
  const deadlineTimeZone = String(scholarship.deadlineTimezone ?? "").trim();
  const currentDeadlineDate = validDeadline ? calendarDateKey(now, deadlineTimeZone) : null;
  if (validDeadline && deadlineTimeZone && !currentDeadlineDate) {
    unknown("Deadline time zone", "The recorded sponsor time zone is not recognized. Confirm its IANA time-zone identifier; expiry will remain unknown until it is valid.");
  }
  const isExpired = !isNotYetOpen && !openingStatusUnknown && !openingRangeInvalid && validDeadline && currentDeadlineDate !== null && deadlineValue < currentDeadlineDate;
  const mandatoryChecks = checks.filter((item) => item.importance !== "preferred");
  const passed = mandatoryChecks.filter((item) => item.outcome === "pass").length;
  const failed = mandatoryChecks.filter((item) => item.outcome === "fail").length;
  const unknownCount = mandatoryChecks.filter((item) => item.outcome === "unknown").length;

  const blockingUnknowns = mandatoryChecks.filter((item) =>
    item.outcome === "unknown" && item.label !== "Official source verification"
  ).length;
  let status = "Needs information";
  if (isExpired) status = "Expired";
  else if (failed > 0) status = "Ineligible";
  else if (blockingUnknowns > 0) status = "Needs information";
  else if (!sourceVerified) status = "Rules match — source unverified";
  else status = "Eligible";

  return {
    status,
    checks,
    passed,
    failed,
    unknown: unknownCount,
    riskFlags,
    isExpired: Boolean(isExpired),
    sourceVerified,
    sourceStatus,
  };
}
