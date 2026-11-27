export type DeadlineUrgency = {
  status: "unknown" | "not-open" | "overdue" | "today" | "due-soon" | "upcoming";
  daysRemaining: number | null;
  label: string;
};
export type PotentialDuplicate = {
  firstIndex: number;
  secondIndex: number;
  firstId: string;
  secondId: string;
  firstName: string;
  secondName: string;
  sponsor: string;
  deadlineYear: string;
  titleSimilarity: number;
  matchType: "exact" | "strong" | "possible";
  matchLabel: "Exact title match" | "Strong similarity" | "Possible similarity";
  reasons: string[];
};
export type DeadlineMilestone = {
  key: "opening" | "priority" | "final";
  label: "Application opens" | "Priority deadline" | "Final deadline";
  deadline: string;
  deadlineText: string;
  deadlineTime: string;
  timeZone: string;
};
export function getDeadlineMilestones(record?: object): DeadlineMilestone[];
export function getDeadlineUrgency(deadline: string | undefined, now?: Date, timeZone?: string, openDate?: string, openDateTimezone?: string, deadlineTime?: string): DeadlineUrgency;
export function findPotentialDuplicates(records?: unknown[]): PotentialDuplicate[];
