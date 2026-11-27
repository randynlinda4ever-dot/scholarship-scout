export const APPLICATION_CHECKLIST_STEPS: readonly string[];
export type ApplicationProgress = Record<string, boolean[]>;
export function normalizeApplicationProgress(value: unknown, validScholarshipIds?: string[], stepCount?: number): ApplicationProgress;
export function updateApplicationProgress(progress: unknown, scholarshipId: string, stepIndex: number, checked: boolean, stepCount?: number): ApplicationProgress;
export function getApplicationProgressSummary(progress: unknown, scholarshipId: string, stepCount?: number): { completed: number; total: number; percent: number };
