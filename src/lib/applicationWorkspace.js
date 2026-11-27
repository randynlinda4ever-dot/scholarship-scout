import { MAX_TRACKER_RECORDS } from "./trackerManagement.js";

export const APPLICATION_DOCUMENT_TEMPLATES = Object.freeze([
  "Official transcript",
  "Résumé / activities list",
  "Recommendation letter(s)",
  "Essay / short-answer responses",
  "Proof of membership or eligibility",
  "Additional supporting documents",
]);

export const FINAL_APPLICATION_REVIEW_ITEMS = Object.freeze([
  "Confirm the sponsor's official deadline and submission instructions",
  "Check every response against its exact prompt and word limit",
  "Verify names, contact details, and all required fields",
  "Confirm every required file is the correct version and opens properly",
  "Review the final application and save a copy",
]);

export const RECOMMENDATION_STATUSES = Object.freeze([
  "Not requested", "Requested", "Confirmed", "Received",
]);

const INVALID_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_TASKS = 50;
const MAX_ESSAYS = 20;
const MAX_RECOMMENDERS = 20;
const MAX_DOCUMENTS = 30;
const MAX_TASK_TITLE = 160;
const MAX_ESSAY_TITLE = 160;
const MAX_ESSAY_PROMPT = 5000;
const MAX_ESSAY_DRAFT = 20000;
const MAX_CONTACT_NAME = 120;
const MAX_NOTES = 1000;

const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const trimText = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";
const safeId = (value) => {
  const id = trimText(value, 80);
  return id && !INVALID_KEYS.has(id) ? id : "";
};
const validDateOnly = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : "";
};
const positiveWordLimit = (value) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, 10000) : 0;
};

export function createApplicationWorkspace() {
  return {
    customTasks: [],
    essays: [],
    recommenders: [],
    documents: APPLICATION_DOCUMENT_TEMPLATES.map((title, index) => ({
      id: `doc-template-${index + 1}`,
      title,
      required: false,
      ready: false,
      dueDate: "",
      notes: "",
    })),
    finalReview: FINAL_APPLICATION_REVIEW_ITEMS.map((label, index) => ({
      id: `review-${index + 1}`,
      label,
      done: false,
    })),
  };
}

function normalizeRows(rows, maxRows, normalizeRow) {
  if (!Array.isArray(rows)) return [];
  const output = [];
  const seenIds = new Set();
  for (const row of rows.slice(0, maxRows * 2)) {
    if (!isRecord(row)) continue;
    const normalized = normalizeRow(row);
    if (!normalized || !normalized.id || seenIds.has(normalized.id)) continue;
    seenIds.add(normalized.id);
    output.push(normalized);
    if (output.length >= maxRows) break;
  }
  return output;
}

function normalizeWorkspaceEntry(value) {
  const defaults = createApplicationWorkspace();
  const source = isRecord(value) ? value : {};
  const customTasks = normalizeRows(source.customTasks, MAX_TASKS, (row) => {
    const id = safeId(row.id);
    const title = trimText(row.title, MAX_TASK_TITLE);
    if (!id || !title) return null;
    return { id, title, completed: row.completed === true, dueDate: validDateOnly(row.dueDate) };
  });
  const essays = normalizeRows(source.essays, MAX_ESSAYS, (row) => {
    const id = safeId(row.id);
    const title = trimText(row.title, MAX_ESSAY_TITLE);
    if (!id || !title) return null;
    return {
      id,
      title,
      prompt: trimText(row.prompt, MAX_ESSAY_PROMPT),
      wordLimit: positiveWordLimit(row.wordLimit),
      draft: typeof row.draft === "string" ? row.draft.slice(0, MAX_ESSAY_DRAFT) : "",
    };
  });
  const recommenders = normalizeRows(source.recommenders, MAX_RECOMMENDERS, (row) => {
    const id = safeId(row.id);
    const name = trimText(row.name, MAX_CONTACT_NAME);
    if (!id || !name) return null;
    const status = RECOMMENDATION_STATUSES.includes(row.status) ? row.status : "Not requested";
    return {
      id,
      name,
      role: trimText(row.role, MAX_CONTACT_NAME),
      status,
      requestedAt: validDateOnly(row.requestedAt),
      dueDate: validDateOnly(row.dueDate),
      receivedAt: validDateOnly(row.receivedAt),
      notes: trimText(row.notes, MAX_NOTES),
    };
  });
  const documents = Array.isArray(source.documents)
    ? normalizeRows(source.documents, MAX_DOCUMENTS, (row) => {
      const id = safeId(row.id);
      const title = trimText(row.title, MAX_TASK_TITLE);
      if (!id || !title) return null;
      return {
        id,
        title,
        required: row.required === true,
        ready: row.ready === true,
        dueDate: validDateOnly(row.dueDate),
        notes: trimText(row.notes, MAX_NOTES),
      };
    })
    : defaults.documents;
  const savedReview = Array.isArray(source.finalReview) ? source.finalReview : [];
  const finalReview = defaults.finalReview.map((item) => {
    const match = savedReview.find((row) => isRecord(row) && row.id === item.id);
    return { ...item, done: Boolean(match?.done === true) };
  });
  return { customTasks, essays, recommenders, documents, finalReview };
}

export function normalizeApplicationWorkspace(value, validScholarshipIds) {
  const normalized = {};
  if (!isRecord(value)) return normalized;
  const allowedIds = Array.isArray(validScholarshipIds) ? new Set(validScholarshipIds) : null;
  for (const [scholarshipId, entry] of Object.entries(value).slice(0, MAX_TRACKER_RECORDS)) {
    if (!scholarshipId || scholarshipId.length > 200 || INVALID_KEYS.has(scholarshipId)) continue;
    if (allowedIds && !allowedIds.has(scholarshipId)) continue;
    if (!isRecord(entry)) continue;
    normalized[scholarshipId] = normalizeWorkspaceEntry(entry);
  }
  return normalized;
}

export function countApplicationWords(value) {
  if (typeof value !== "string" || !value.trim()) return 0;
  const matches = value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+|-[\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function getApplicationWorkspaceSummary(workspace, applicationSteps = []) {
  const entry = normalizeWorkspaceEntry(workspace);
  const completedBaseSteps = Array.isArray(applicationSteps)
    ? applicationSteps.filter((step) => step === true).length
    : 0;
  const totalBaseSteps = Array.isArray(applicationSteps) ? applicationSteps.length : 0;
  const essayWordCounts = entry.essays.map((essay) => countApplicationWords(essay.draft));
  const overLimitEssays = entry.essays.filter((essay, index) =>
    essay.wordLimit > 0 && essayWordCounts[index] > essay.wordLimit,
  ).length;
  const completedEssays = entry.essays.filter((essay, index) =>
    essayWordCounts[index] > 0 && (essay.wordLimit === 0 || essayWordCounts[index] <= essay.wordLimit),
  ).length;
  const completedRecommenders = entry.recommenders.filter((person) => person.status === "Received").length;
  const requiredDocuments = entry.documents.filter((document) => document.required);
  const readyDocuments = requiredDocuments.filter((document) => document.ready).length;
  const completedTasks = entry.customTasks.filter((task) => task.completed).length;
  const completedReview = entry.finalReview.filter((item) => item.done).length;
  const total = totalBaseSteps + entry.customTasks.length + entry.essays.length +
    entry.recommenders.length + requiredDocuments.length + entry.finalReview.length;
  const completed = completedBaseSteps + completedTasks + completedEssays +
    completedRecommenders + readyDocuments + completedReview;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    wordCount: essayWordCounts.reduce((sum, count) => sum + count, 0),
    overLimitEssays,
    pendingRecommendations: entry.recommenders.filter((person) => person.status !== "Received").length,
    requiredDocuments: requiredDocuments.length,
    readyDocuments: readyDocuments.length,
  };
}

export function isValidApplicationWorkspace(value, validScholarshipIds) {
  if (!isRecord(value) || Object.keys(value).length > MAX_TRACKER_RECORDS) return false;
  const allowedIds = new Set(validScholarshipIds);
  const validRowId = (id) => typeof id === "string" &&
    id.trim().length > 0 && id.trim().length <= 80 && !INVALID_KEYS.has(id.trim());
  const validText = (text, maxLength, required = false) =>
    typeof text === "string" && text.trim().length <= maxLength &&
    (!required || text.trim().length > 0);

  for (const [scholarshipId, entry] of Object.entries(value)) {
    if (!scholarshipId || scholarshipId.length > 200 || INVALID_KEYS.has(scholarshipId) ||
        !allowedIds.has(scholarshipId) || !isRecord(entry)) return false;
    const schemas = [
      ["customTasks", MAX_TASKS, (row) => validRowId(row.id) && validText(row.title, MAX_TASK_TITLE, true) &&
        typeof row.completed === "boolean" && (row.dueDate === "" || validDateOnly(row.dueDate) === row.dueDate)],
      ["essays", MAX_ESSAYS, (row) => validRowId(row.id) && validText(row.title, MAX_ESSAY_TITLE, true) &&
        validText(row.prompt, MAX_ESSAY_PROMPT) &&
        Number.isInteger(row.wordLimit) && row.wordLimit >= 0 && row.wordLimit <= 10000 &&
        typeof row.draft === "string" && row.draft.length <= MAX_ESSAY_DRAFT],
      ["recommenders", MAX_RECOMMENDERS, (row) => validRowId(row.id) && validText(row.name, MAX_CONTACT_NAME, true) &&
        validText(row.role, MAX_CONTACT_NAME) && validText(row.notes, MAX_NOTES) &&
        RECOMMENDATION_STATUSES.includes(row.status) &&
        ["requestedAt", "dueDate", "receivedAt"].every((key) => row[key] === "" || validDateOnly(row[key]) === row[key])],
      ["documents", MAX_DOCUMENTS, (row) => validRowId(row.id) && validText(row.title, MAX_TASK_TITLE, true) &&
        typeof row.required === "boolean" && typeof row.ready === "boolean" &&
        validText(row.notes, MAX_NOTES) && (row.dueDate === "" || validDateOnly(row.dueDate) === row.dueDate)],
    ];
    for (const [key, maxLength, validateRow] of schemas) {
      if (entry[key] !== undefined) {
        if (!Array.isArray(entry[key]) || entry[key].length > maxLength) return false;
        const seenIds = new Set();
        for (const row of entry[key]) {
          if (!isRecord(row) || !validateRow(row)) return false;
          const id = row.id.trim();
          if (seenIds.has(id)) return false;
          seenIds.add(id);
        }
      }
    }
    if (entry.finalReview !== undefined) {
      if (!Array.isArray(entry.finalReview) || entry.finalReview.length > FINAL_APPLICATION_REVIEW_ITEMS.length) return false;
      const seenReviewIds = new Set();
      for (const row of entry.finalReview) {
        if (!isRecord(row) || typeof row.id !== "string" ||
            !/^review-[1-5]$/.test(row.id) || typeof row.done !== "boolean" ||
            seenReviewIds.has(row.id)) return false;
        seenReviewIds.add(row.id);
      }
    }
  }
  return true;
}
