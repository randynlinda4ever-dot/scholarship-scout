export const MAX_RESOURCE_COMPARISONS: number;
export type ResourceAidComparison = {
  id: string;
  school: string;
  cost: string;
  grants: string;
  notes: string;
};
export type ResourceEssayPlan = {
  scholarshipName: string;
  prompt: string;
  wordLimit: string;
  promptInMyWords: string;
  coreMessage: string;
  specificStory: string;
  opening: string;
  context: string;
  action: string;
  reflection: string;
  connection: string;
  closing: string;
};
export type ResourceWorkspace = {
  essayPlan: ResourceEssayPlan;
  aidChecklist: { completed: string[]; comparisons: ResourceAidComparison[] };
  calendarCompleted: string[];
};
export const RESOURCE_AID_CHECKLIST: readonly { id: string; label: string; detail: string }[];
export const RESOURCE_CALENDAR: readonly {
  id: string;
  label: string;
  title: string;
  tasks: readonly { id: string; label: string }[];
}[];
export function createResourceWorkspace(): ResourceWorkspace;
export function normalizeResourceWorkspace(input: unknown): ResourceWorkspace;
export function isValidResourceWorkspace(input: unknown): boolean;
export function calculateNetPrice(totalCost: string | number | null | undefined, grantAid: string | number | null | undefined): number | null;
