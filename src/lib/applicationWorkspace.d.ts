export type ApplicationTask = { id: string; title: string; completed: boolean; dueDate: string };
export type ApplicationEssay = { id: string; title: string; prompt: string; wordLimit: number; draft: string };
export type ApplicationRecommender = {
  id: string; name: string; role: string;
  status: "Not requested" | "Requested" | "Confirmed" | "Received";
  requestedAt: string; dueDate: string; receivedAt: string; notes: string;
};
export type ApplicationDocument = { id: string; title: string; required: boolean; ready: boolean; dueDate: string; notes: string };
export type ApplicationReviewItem = { id: string; label: string; done: boolean };
export type ApplicationWorkspaceEntry = {
  customTasks: ApplicationTask[];
  essays: ApplicationEssay[];
  recommenders: ApplicationRecommender[];
  documents: ApplicationDocument[];
  finalReview: ApplicationReviewItem[];
};
export type ApplicationWorkspace = Record<string, ApplicationWorkspaceEntry>;
export const APPLICATION_DOCUMENT_TEMPLATES: readonly string[];
export const FINAL_APPLICATION_REVIEW_ITEMS: readonly string[];
export const RECOMMENDATION_STATUSES: readonly ApplicationRecommender["status"][];
export function createApplicationWorkspace(): ApplicationWorkspaceEntry;
export function normalizeApplicationWorkspace(value: unknown, validScholarshipIds?: string[]): ApplicationWorkspace;
export function countApplicationWords(value: unknown): number;
export function getApplicationWorkspaceSummary(workspace: unknown, applicationSteps?: boolean[]): {
  completed: number; total: number; percent: number; wordCount: number;
  overLimitEssays: number; pendingRecommendations: number; requiredDocuments: number; readyDocuments: number;
};
export function isValidApplicationWorkspace(value: unknown, validScholarshipIds: string[]): boolean;
