export const APPLICATION_STATUSES: readonly [
  "Not started",
  "Preparing",
  "Ready",
  "Submitted",
  "Awarded",
  "Rejected"
];
export const TRACKER_PRIORITIES: readonly ["Low", "Medium", "High"];
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];
export type TrackerPriority = typeof TRACKER_PRIORITIES[number];
export type TrackerRecord = {
  id: string;
  name?: string;
  provider?: string;
  award?: string;
  deadline?: string;
  applicationStatus: ApplicationStatus;
  priority: TrackerPriority;
  tags: string[];
  archived: boolean;
  submittedAt: string;
  decisionDate: string;
  [key: string]: unknown;
};
export function normalizeTrackerRecord<T extends object>(record: T): T & TrackerRecord;
export function filterAndSortTrackerRecords<T extends object>(
  records?: T[],
  options?: {
    search?: string;
    eligibilityFilter?: string;
    applicationStatusFilter?: string;
    archiveFilter?: "active" | "archived" | "all";
    sortBy?: "deadline" | "priority" | "award" | "applicationStatus" | "eligibility" | "name";
    assessments?: Map<string, { status?: string }> | Record<string, { status?: string }>;
  },
): Array<T & TrackerRecord>;
export function getApplicationStatusCounts(records?: unknown[]): {
  inProgress: number;
  ready: number;
  submitted: number;
  awarded: number;
  rejected: number;
  notStarted: number;
};
