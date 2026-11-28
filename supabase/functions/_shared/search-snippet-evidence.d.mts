export type ScholarshipSearchSignals = {
  awardText: string | null;
  deadline: string | null;
  deadlineText: string | null;
  deadlineNotPublished: boolean;
};
export function parseStrictSearchDate(value: unknown): string | null;
export function matchScholarshipEvidence(title: unknown, value: unknown): string;
export function extractScholarshipSearchSignals(value: unknown): ScholarshipSearchSignals;
export function getScholarshipTitleSpecificity(value: unknown): number;
export function isScholarshipDirectoryLandingPage(value: unknown, title?: unknown, excerpt?: unknown): boolean;
