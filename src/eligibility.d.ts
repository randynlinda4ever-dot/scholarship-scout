export type CheckOutcome = "pass" | "fail" | "unknown";
export type CriterionEvidence = { state: "linked" | "unknown"; excerpt: string; sourceUrl: string };
export type CriterionImportance = "mandatory" | "preferred";
export type RuleCheck = {
  label: string; outcome: CheckOutcome; importance: CriterionImportance; detail: string;
  criterionKey?: keyof EligibilityCriteria;
  evidence?: CriterionEvidence;
};
export type EligibilityCriteria = {
  /** Applicant's state of legal/current residence; not school or college location. */
  state?: string;
  /** State where the applicant's current school is physically located. */
  schoolState?: string;
  /** State where the applicant intends to attend college. */
  collegeState?: string;
  district?: string;
  requiresShhMembership?: boolean;
  requiresSpanishAchievement?: boolean;
  requiredNseMedalYears?: number[];
  requiresNseRegistration2027?: boolean;
  requiresFourHMembership?: boolean;
  requiresTestScore?: boolean;
  citizenship?: "any" | "us-citizen" | "eligible-noncitizen";
  educationLevel?: "high-school-senior" | "high-school-student" | "incoming-college" | "undergraduate";
  graduationYear?: number | "";
  /** Explicit sponsor age boundaries; each supplied boundary must state whether it is inclusive. */
  ageRange?: { min?: number; minInclusive?: boolean; max?: number; maxInclusive?: boolean };
  minGpa?: number | "";
  topPercentMax?: number | "";
  minAct?: number | "";
  minSat?: number | "";
  minActOrSat?: { act?: number; sat?: number };
  majorKeywords?: string[];
  institution?: string;
  requiresFullTimeEnrollment?: boolean;
  /** Sponsor-accepted enrollment alternatives; any explicitly satisfied route can qualify. */
  enrollmentStatuses?: Array<"full-time" | "part-time" | "incoming" | "current-student">;
  minServiceHours?: number | "";
  requiredMembership?: string;
  requiresFinancialNeed?: boolean;
  requiresFirstGeneration?: boolean;
  otherRequirement?: string;
  applicationFee?: boolean | null;
};
export type MatchProfile = {
  state?: string; schoolState?: string; plannedCollegeState?: string;
  district?: string; citizenship?: string; age?: string | number; grade?: string; graduationYear?: string;
  collegeStatus?: string; gpa?: string; classRank?: string; act?: string; sat?: string;
  shhMembershipStatus?: string; spanishAchievementStatus?: string; nseMedalYears?: string;
  nseRegistered2027?: string; fourHMembershipStatus?: string;
  plannedMajor?: string; interests?: string; plannedCollege?: string;
  serviceHours?: string; activities?: string; firstGeneration?: string;
};
export type ScholarshipForAssessment = {
  criteria?: EligibilityCriteria;
  criteriaImportance?: Partial<Record<keyof EligibilityCriteria, CriterionImportance>>;
  criteriaEvidence?: Record<string, { excerpt?: string; sourceUrl?: string }>;
  sourceUrl?: string; sourceVerified?: boolean;
  evidenceText?: string; deadline?: string; deadlineTimezone?: string;
};
export type EligibilityAssessment = {
  status: "Eligible" | "Rules match — source unverified" | "Needs information" | "Ineligible" | "Expired";
  checks: RuleCheck[]; passed: number; failed: number; unknown: number;
  riskFlags: string[]; isExpired: boolean;
  sourceVerified: boolean;
  sourceStatus: "verified" | "needs-review" | "expired";
};
export function profileRankPercent(profile: MatchProfile): number | null;
export function assessEligibility(scholarship: ScholarshipForAssessment, profile: MatchProfile, now?: Date): EligibilityAssessment;
