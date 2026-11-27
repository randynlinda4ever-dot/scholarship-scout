export const MAX_TRACKER_RECORDS = 2000;

export const APPLICATION_STATUSES = [
  "Not started",
  "Preparing",
  "Ready",
  "Submitted",
  "Awarded",
  "Rejected",
];

export const TRACKER_PRIORITIES = ["Low", "Medium", "High"];

const STATUS_ORDER = new Map(APPLICATION_STATUSES.map((status, index) => [status, index]));
const PRIORITY_ORDER = new Map(TRACKER_PRIORITIES.map((priority, index) => [priority, index]));

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : "";
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((tag) => typeof tag === "string")
    .map((tag) => tag.trim().replace(/\s+/g, " ").slice(0, 48))
    .filter(Boolean))].slice(0, 20);
}

export function normalizeTrackerRecord(record = {}) {
  const source = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const applicationStatus = APPLICATION_STATUSES.includes(source.applicationStatus)
    ? source.applicationStatus
    : "Not started";
  const priority = TRACKER_PRIORITIES.includes(source.priority)
    ? source.priority
    : "Medium";

  return {
    ...source,
    applicationStatus,
    priority,
    tags: normalizeTags(source.tags),
    archived: source.archived === true,
    submittedAt: validDate(source.submittedAt),
    decisionDate: validDate(source.decisionDate),
  };
}

function eligibilityStatus(assessments, id) {
  if (assessments instanceof Map) return assessments.get(id)?.status ?? "Needs information";
  return assessments && typeof assessments === "object"
    ? assessments[id]?.status ?? "Needs information"
    : "Needs information";
}

function awardAmount(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function compareNullableNumber(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

export function filterAndSortTrackerRecords(records = [], options = {}) {
  if (!Array.isArray(records)) return [];

  const {
    search = "",
    eligibilityFilter = "All",
    applicationStatusFilter = "All",
    archiveFilter = "active",
    sortBy = "deadline",
    assessments,
  } = options;
  const searchTerm = String(search).trim().toLowerCase();

  const filtered = records
    .map(normalizeTrackerRecord)
    .filter((record) => {
      if (archiveFilter === "active" && record.archived) return false;
      if (archiveFilter === "archived" && !record.archived) return false;
      if (
        applicationStatusFilter !== "All" &&
        record.applicationStatus !== applicationStatusFilter
      ) return false;
      if (
        eligibilityFilter !== "All" &&
        eligibilityStatus(assessments, record.id) !== eligibilityFilter
      ) return false;
      if (!searchTerm) return true;
      return [record.name, record.provider, ...(record.tags ?? [])]
        .some((value) => String(value ?? "").toLowerCase().includes(searchTerm));
    });

  const sorters = {
    deadline: (left, right) =>
      compareText(left.deadline || "9999-12-31", right.deadline || "9999-12-31"),
    priority: (left, right) =>
      (PRIORITY_ORDER.get(right.priority) ?? 1) - (PRIORITY_ORDER.get(left.priority) ?? 1),
    award: (left, right) =>
      compareNullableNumber(awardAmount(left.award), awardAmount(right.award)),
    applicationStatus: (left, right) =>
      (STATUS_ORDER.get(left.applicationStatus) ?? 0) - (STATUS_ORDER.get(right.applicationStatus) ?? 0),
    eligibility: (left, right) =>
      compareText(eligibilityStatus(assessments, left.id), eligibilityStatus(assessments, right.id)),
    name: (left, right) => compareText(left.name, right.name),
  };

  const compare = sorters[sortBy] ?? sorters.deadline;
  return filtered.sort((left, right) =>
    compare(left, right) || compareText(left.name, right.name) || compareText(left.id, right.id),
  );
}

export function getApplicationStatusCounts(records = []) {
  const counts = {
    inProgress: 0,
    ready: 0,
    submitted: 0,
    awarded: 0,
    rejected: 0,
    notStarted: 0,
  };
  if (!Array.isArray(records)) return counts;

  for (const raw of records) {
    const record = normalizeTrackerRecord(raw);
    if (record.archived) continue;
    switch (record.applicationStatus) {
      case "Preparing": counts.inProgress += 1; break;
      case "Ready": counts.ready += 1; break;
      case "Submitted": counts.submitted += 1; break;
      case "Awarded": counts.awarded += 1; break;
      case "Rejected": counts.rejected += 1; break;
      default: counts.notStarted += 1; break;
    }
  }
  return counts;
}
