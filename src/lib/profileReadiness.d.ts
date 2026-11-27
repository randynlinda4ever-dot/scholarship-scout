export type ProfileReadinessField = {
  key: string;
  label: string;
  reason: string;
  complete: boolean;
};
export type ProfileReadinessGroup = {
  completedCount: number;
  totalCount: number;
  percent: number;
  fields: ProfileReadinessField[];
  missing: ProfileReadinessField[];
};
export type ProfileReadiness = {
  core: ProfileReadinessGroup;
  supporting: ProfileReadinessGroup;
};
export function getProfileReadiness(profile?: object | null): ProfileReadiness;
