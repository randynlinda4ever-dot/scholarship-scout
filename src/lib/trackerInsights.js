import { calendarDateKey } from "./evidence.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const POSSIBLE_DUPLICATE_THRESHOLD = 0.8;
const STRONG_DUPLICATE_THRESHOLD = 0.85;

/** Keep sponsor priority and final dates as separate deadline milestones. */
export function getDeadlineMilestones(record = {}) {
  if (!record || typeof record !== "object") return [];
  const priorityDeadline = String(record.priorityDeadline ?? "").trim();
  const finalDeadline = String(record.finalDeadline ?? record.deadline ?? "").trim();
  const openDate = String(record.openDate ?? "").trim();
  const hasPriorityMilestone = Boolean(priorityDeadline || String(record.priorityDeadlineText ?? "").trim());
  const finalDeadlineText = String(record.finalDeadlineText ?? record.deadlineText ?? "").trim();
  const milestones = [];
  if (hasPriorityMilestone) {
    milestones.push({
      key: "priority",
      label: "Priority deadline",
      deadline: priorityDeadline,
      deadlineText: String(record.priorityDeadlineText ?? "").trim(),
      deadlineTime: String(record.priorityDeadlineTime ?? "").trim(),
      timeZone: String(record.priorityDeadlineTimezone ?? "").trim(),
    });
  }
  if (finalDeadline || finalDeadlineText) {
    milestones.push({
      key: "final",
      label: "Final deadline",
      deadline: finalDeadline,
      deadlineText: finalDeadlineText,
      deadlineTime: String(record.finalDeadlineTime ?? record.deadlineTime ?? "").trim(),
      timeZone: String(record.finalDeadlineTimezone ?? record.deadlineTimezone ?? "").trim(),
    });
  } else if (openDate && !hasPriorityMilestone) {
    milestones.push({
      key: "opening",
      label: "Application opens",
      deadline: "",
      deadlineText: "",
      deadlineTime: "",
      timeZone: String(record.openDateTimezone ?? "").trim(),
    });
  }
  return milestones;
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function normalizedWords(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
      if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
      return word;
    });
}

function normalizedSponsor(value) {
  return normalizedWords(value)
    .filter((word) => !["inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation"].includes(word))
    .join(" ");
}

function normalizedTitle(value) {
  return normalizedWords(value).join(" ");
}

function tokenDiceSimilarity(left, right) {
  const leftTokens = new Set(normalizedWords(left));
  const rightTokens = new Set(normalizedWords(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function clockTimeKey(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (!values.hour || !values.minute) return null;
    return `${values.hour.padStart(2, "0")}:${values.minute.padStart(2, "0")}`;
  } catch {
    return null;
  }
}
function formatClockTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * Deadline urgency respects an explicit sponsor cutoff and time zone.
 * A future sponsor-confirmed opening date takes precedence; no zones are inferred.
 */
export function getDeadlineUrgency(deadline, now = new Date(), timeZone = "", openDate = "", openDateTimezone = "", deadlineTime = "") {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { status: "unknown", daysRemaining: null, label: "Deadline not confirmed" };
  }
  if (openDate) {
    if (!isValidDateKey(openDate)) return { status: "unknown", daysRemaining: null, label: "Opening date needs review" };
    if (isValidDateKey(deadline) && deadline < openDate) {
      return { status: "unknown", daysRemaining: null, label: "Opening/deadline range needs review" };
    }
    const openingToday = calendarDateKey(now, openDateTimezone);
    if (!openingToday) return { status: "unknown", daysRemaining: null, label: "Opening date time zone needs review" };
    if (openDate > openingToday) {
      const [openYear, openMonth, openDay] = openDate.split("-").map(Number);
      const [todayYear, todayMonth, todayDay] = openingToday.split("-").map(Number);
      const daysUntilOpen = Math.round((Date.UTC(openYear, openMonth - 1, openDay) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / DAY_MS);
      return { status: "not-open", daysRemaining: daysUntilOpen, label: `Opens in ${daysUntilOpen} ${daysUntilOpen === 1 ? "day" : "days"}` };
    }  }  if (!isValidDateKey(deadline)) return { status: "unknown", daysRemaining: null, label: "Deadline not confirmed" };
  const todayKey = calendarDateKey(now, timeZone);
  if (!todayKey) return { status: "unknown", daysRemaining: null, label: "Deadline time zone needs review" };
  const [year, month, day] = deadline.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayKey.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const daysRemaining = Math.round((targetUtc - todayUtc) / DAY_MS);

  if (daysRemaining < 0) {    const overdueDays = Math.abs(daysRemaining);
    return {
      status: "overdue",
      daysRemaining,
      label: `Overdue by ${overdueDays} ${overdueDays === 1 ? "day" : "days"}`,
    };
  }
  if (daysRemaining === 0) {
    if (deadlineTime) {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(deadlineTime) || !timeZone) {
        return { status: "unknown", daysRemaining: null, label: "Sponsor cutoff needs time-zone confirmation" };
      }
      const currentTime = clockTimeKey(now, timeZone);
      if (!currentTime) return { status: "unknown", daysRemaining: null, label: "Sponsor cutoff time zone needs review" };
      if (currentTime >= deadlineTime) {
        return { status: "overdue", daysRemaining: 0, label: "Sponsor cutoff passed today" };
      }
      return { status: "today", daysRemaining: 0, label: `Due today by ${formatClockTime(deadlineTime)}` };
    }
    return { status: "today", daysRemaining: 0, label: "Due today" };
  }
  if (daysRemaining <= 7) {
    return {
      status: "due-soon",
      daysRemaining,
      label: `Due in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`,
    };
  }
  return {
    status: "upcoming",
    daysRemaining,
    label: `Due in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`,
  };
}

/**
 * Suggest likely duplicates without merging or changing either record.
 * A shared normalized sponsor and an actual calendar deadline in the same
 * year are required; only then are near-identical titles compared.
 */
export function findPotentialDuplicates(records = []) {
  if (!Array.isArray(records)) return [];
  const suggestions = [];
  const prepared = records.map((record) => {
    if (!record || typeof record !== "object") return null;
    const id = String(record.id ?? "");
    const deadline = isValidDateKey(record.deadline) ? record.deadline.slice(0, 4) : "";
    const name = String(record.name ?? record.title ?? "");
    const titleTokens = new Set(normalizedWords(name));
    const sponsorKey = normalizedSponsor(record.provider ?? record.sponsor);
    if (!id || !deadline || !sponsorKey || !titleTokens.size) return null;
    return {
      id,
      deadline,
      sponsorKey,
      name,
      titleKey: normalizedTitle(name),
      titleTokens,
      sponsor: String(record.provider ?? record.sponsor ?? ""),
    };
  });

  const groups = new Map();
  prepared.forEach((entry, index) => {
    if (!entry) return;
    const key = entry.sponsorKey + "|" + entry.deadline;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...entry, index });
  });

  for (const group of groups.values()) {
    for (let firstPosition = 0; firstPosition < group.length; firstPosition += 1) {
      const first = group[firstPosition];
      for (let secondPosition = firstPosition + 1; secondPosition < group.length; secondPosition += 1) {
        const second = group[secondPosition];
        if (first.id === second.id) continue;
      const intersection = [...first.titleTokens].filter((token) => second.titleTokens.has(token)).length;
      const titleSimilarity = (2 * intersection) / (first.titleTokens.size + second.titleTokens.size);
      if (titleSimilarity < POSSIBLE_DUPLICATE_THRESHOLD) continue;
      const firstName = first.name;
      const secondName = second.name;
      const firstTitleKey = first.titleKey;
      const secondTitleKey = second.titleKey;

      const matchType = firstTitleKey === secondTitleKey
        ? "exact"
        : titleSimilarity >= STRONG_DUPLICATE_THRESHOLD
          ? "strong"
          : "possible";
      const matchLabel = matchType === "exact"
        ? "Exact title match"
        : matchType === "strong"
          ? "Strong similarity"
          : "Possible similarity";
      const percentage = Math.round(titleSimilarity * 100);
      const titleReason = matchType === "exact"
        ? "Titles match after normalization"
        : matchType === "strong"
          ? `Titles are strongly similar (${percentage}%)`
          : `Titles may be similar (${percentage}%)`;
      suggestions.push({
        firstIndex: first.index,
        secondIndex: second.index,
        firstId: first.id,
        secondId: second.id,
        firstName,
        secondName,
        sponsor: first.sponsor,
        deadlineYear: first.deadline,
        titleSimilarity: percentage,
        matchType,
        matchLabel,
        reasons: [
          "Same sponsor",
          "Same deadline year",
          titleReason,        ],
      });
      }
    }
  }

  return suggestions.sort((left, right) =>
    right.titleSimilarity - left.titleSimilarity ||
    left.firstIndex - right.firstIndex ||
    left.secondIndex - right.secondIndex
  );
}
