export type EligibilitySummaryItem = {
  label: string; outcome: "pass" | "fail" | "unknown"; importance?: "mandatory" | "preferred"; detail?: string;
  criterionKey?: string;
  evidence?: { state: "linked" | "unknown"; excerpt: string; sourceUrl: string };
};
export type EligibilitySummary = {
  status: string;
  passed: EligibilitySummaryItem[];
  failed: EligibilitySummaryItem[];
  unknown: EligibilitySummaryItem[];
  preferred: EligibilitySummaryItem[];
  headline: string;
  caveat: string;
};
export function summarizeEligibilityAssessment(assessment?: { status?: string; checks?: unknown[] } | null): EligibilitySummary;
