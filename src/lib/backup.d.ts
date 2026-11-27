import type { ApplicationWorkspace } from "./applicationWorkspace.js";

export type ScoutBackup<TProfile = Record<string, string>, TScholarship = Record<string, unknown>> = {
  format: "scholarship-scout-backup";
  version: 2;
  exportedAt: string;
  profile: TProfile;
  scholarships: TScholarship[];
  applicationProgress: Record<string, boolean[]>;
  applicationWorkspace: ApplicationWorkspace;
};

export type ScoutBackupValidation<TProfile = Record<string, string>, TScholarship = Record<string, unknown>> =
  | { ok: true; value: {
      profile: TProfile;
      scholarships: TScholarship[];
      applicationProgress: Record<string, boolean[]>;
      applicationWorkspace: ApplicationWorkspace;
    } }
  | { ok: false; error: string };

export function buildScoutBackup<TProfile extends Record<string, unknown>, TScholarship>(
  profile?: TProfile,
  scholarships?: TScholarship[],
  exportedAt?: Date,
  applicationProgress?: Record<string, boolean[]>,
  applicationWorkspace?: ApplicationWorkspace,
): ScoutBackup<TProfile, TScholarship>;

export function validateScoutBackup<TProfile = Record<string, string>, TScholarship = Record<string, unknown>>(
  input: unknown,
  allowedProfileKeys: string[],
): ScoutBackupValidation<TProfile, TScholarship>;
