import { isValidApplicationWorkspace, normalizeApplicationWorkspace } from "./applicationWorkspace.js";
import { sanitizePublicHttpsUrl } from "./evidence.js";
import { createResourceWorkspace, normalizeResourceWorkspace, isValidResourceWorkspace } from "./resourceWorkspace.js";

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const MAX_SCHOLARSHIPS = 500;
const MAX_PROGRESS_STEPS = 50;
const INVALID_PROGRESS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function buildScoutBackup(
  profile = {},
  scholarships = [],
  exportedAt = new Date(),
  applicationProgress = {},
  applicationWorkspace = {},
  profileDraft = profile,
  resourceWorkspace = createResourceWorkspace(),
) {
  return {
    format: "scholarship-scout-backup",
    version: 3,
    exportedAt: exportedAt.toISOString(),
    profile: structuredClone(profile),
    profileDraft: structuredClone(isRecord(profileDraft) ? profileDraft : profile),
    scholarships: structuredClone(Array.isArray(scholarships) ? scholarships : []),
    applicationProgress: structuredClone(
      isRecord(applicationProgress) ? applicationProgress : {},
    ),
    applicationWorkspace: structuredClone(
      isRecord(applicationWorkspace) ? applicationWorkspace : {},
    ),
    resourceWorkspace: structuredClone(normalizeResourceWorkspace(resourceWorkspace)),
  };
}

/**
 * Validate untrusted imported JSON before it can replace local application data.
 * Pass the app's known Profile keys to prevent arbitrary fields entering state.
 */
export function validateScoutBackup(input, allowedProfileKeys) {
  try {
    const serialized = JSON.stringify(input);
    if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES) {
      return { ok: false, error: "Backup is larger than the 2 MB limit." };
    }
    if (!isRecord(input)) {
      return { ok: false, error: "The file is not a valid Scholarship Scout backup." };
    }
    if (input.format !== "scholarship-scout-backup" || ![1, 2, 3].includes(input.version)) {
      return { ok: false, error: "This backup format or version is not supported." };
    }
    if (!isRecord(input.profile)) {
      return { ok: false, error: "The backup profile is missing or invalid." };
    }
    const allowed = new Set(allowedProfileKeys);
    for (const [key, value] of Object.entries(input.profile)) {
      if (!allowed.has(key) || typeof value !== "string") {
        return { ok: false, error: "The backup contains an unknown or invalid profile field." };
      }
    }
    const profileDraft = input.profileDraft ?? input.profile;
    if (!isRecord(profileDraft)) {
      return { ok: false, error: "The backup profile draft is missing or invalid." };
    }
    for (const [key, value] of Object.entries(profileDraft)) {
      if (!allowed.has(key) || typeof value !== "string") {
        return { ok: false, error: "The backup contains an unknown or invalid profile draft field." };
      }
    }
    if (!Array.isArray(input.scholarships) || input.scholarships.length > MAX_SCHOLARSHIPS) {
      return { ok: false, error: "The backup scholarship list is invalid or exceeds 500 records." };
    }
    const importedIds = new Set();
    for (const item of input.scholarships) {
      if (!isRecord(item) ||
          typeof item.id !== "string" || !item.id.trim() ||
          INVALID_PROGRESS_KEYS.has(item.id) || importedIds.has(item.id) ||
          typeof item.name !== "string" || !item.name.trim() ||
          typeof item.provider !== "string" ||
          !isRecord(item.criteria)) {
        return { ok: false, error: "A scholarship record is incomplete, duplicated, or invalid. Nothing was imported." };
      }
      importedIds.add(item.id);
    }

    const applicationProgress = input.applicationProgress ?? {};
    if (!isRecord(applicationProgress) || Object.keys(applicationProgress).length > MAX_SCHOLARSHIPS) {
      return { ok: false, error: "Application checklist progress is invalid. Nothing was imported." };
    }
    const scholarshipIds = new Set(importedIds);
    const safeImportedUrl = (value) => typeof value === "string" ? (sanitizePublicHttpsUrl(value) || "") : "";
    const safeScholarships = input.scholarships.map((item) => {
      const record = structuredClone(item);
      for (const key of ["sourceUrl", "evidenceUrl", "awardEvidenceUrl", "discoverySourceUrl"]) {
        if (Object.hasOwn(record, key)) record[key] = safeImportedUrl(record[key]);
      }
      if (isRecord(record.criteriaEvidence)) {
        for (const evidence of Object.values(record.criteriaEvidence)) {
          if (isRecord(evidence) && Object.hasOwn(evidence, "sourceUrl")) evidence.sourceUrl = safeImportedUrl(evidence.sourceUrl);
        }
      }
      if (Array.isArray(record.sourceEvidenceHistory)) {
        record.sourceEvidenceHistory = record.sourceEvidenceHistory.map((entry) => {
          if (!isRecord(entry)) return entry;
          const safeEntry = { ...entry };
          for (const key of ["sourceUrl", "evidenceUrl", "awardEvidenceUrl"]) {
            if (Object.hasOwn(safeEntry, key)) safeEntry[key] = safeImportedUrl(safeEntry[key]);
          }
          if (isRecord(safeEntry.criteriaEvidence)) {
            for (const evidence of Object.values(safeEntry.criteriaEvidence)) {
              if (isRecord(evidence) && Object.hasOwn(evidence, "sourceUrl")) {
                evidence.sourceUrl = safeImportedUrl(evidence.sourceUrl);
              }
            }
          }
          return safeEntry;
        });
      }
      return record;
    });
    for (const [scholarshipId, steps] of Object.entries(applicationProgress)) {
      if (
        INVALID_PROGRESS_KEYS.has(scholarshipId) ||
        !scholarshipIds.has(scholarshipId) ||
        !Array.isArray(steps) ||
        steps.length > MAX_PROGRESS_STEPS ||
        steps.some((value) => typeof value !== "boolean")
      ) {
        return { ok: false, error: "Application checklist progress contains invalid scholarship IDs or steps." };
      }
    }

    const applicationWorkspace = input.applicationWorkspace ?? {};
    const resourceWorkspace = input.resourceWorkspace ?? createResourceWorkspace();
    if (!isValidResourceWorkspace(resourceWorkspace)) {
      return { ok: false, error: "Resource worksheets or progress contain invalid records. Nothing was imported." };
    }
    if (!isValidApplicationWorkspace(applicationWorkspace, [...scholarshipIds])) {
      return { ok: false, error: "Application workspace contains invalid records or scholarship IDs. Nothing was imported." };
    }

    return {
      ok: true,
      value: {
        profile: structuredClone(input.profile),
        profileDraft: structuredClone(profileDraft),
        scholarships: safeScholarships,
        applicationProgress: structuredClone(applicationProgress),
        applicationWorkspace: normalizeApplicationWorkspace(applicationWorkspace, [...scholarshipIds]),
        resourceWorkspace: normalizeResourceWorkspace(resourceWorkspace),
      },
    };
  } catch {    return { ok: false, error: "The backup could not be read safely." };
  }
}
