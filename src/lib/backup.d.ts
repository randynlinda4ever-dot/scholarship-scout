import type { ApplicationWorkspace } from "./applicationWorkspace.js";
import type { ResourceWorkspace } from "./resourceWorkspace.js";

export type ScoutBackup<TProfile = Record<string, string>, TScholarship = Record<string, unknown>> = {
  format: "scholarship-scout-backup";
  version: 3;
  exportedAt: string;
  profile: TProfile;
  profileDraft: TProfile;
  scholarships: TScholarship[];
  applicationProgress: Record<string, boolean[]>;
  applicationWorkspace: ApplicationWorkspace;
  resourceWorkspace: ResourceWorkspace;
};

export type ScoutBackupValidation<TProfile = Record<string, string>, TScholarship = Record<string, unknown>> =
  | { ok: true; value: {
      profile: TProfile;
      profileDraft: TProfile;
      scholarships: TScholarship[];
      applicationProgress: Record<string, boolean[]>;
      applicationWorkspace: ApplicationWorkspace;
      resourceWorkspace: ResourceWorkspace;
    } }
  | { ok: false; error: string };

export function buildScoutBackup<TProfile extends Record<string, unknown>, TScholarship>(
  profile?: TProfile,
  scholarships?: TScholarship[],
  exportedAt?: Date,
  applicationProgress?: Record<string, boolean[]>,
  applicationWorkspace?: ApplicationWorkspace,
  profileDraft?: TProfile,
  resourceWorkspace?: ResourceWorkspace,
): ScoutBackup<TProfile, TScholarship>;

export function validateScoutBackup<TProfile = Record<string, string>, TScholarship = Record<string, unknown>>(
  input: unknown,
  allowedProfileKeys: string[],
): ScoutBackupValidation<TProfile, TScholarship>;
