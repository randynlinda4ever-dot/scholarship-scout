export const MAX_RESOURCE_COMPARISONS = 8;
export const MAX_RESUME_ENTRIES = 30;
export const RESUME_ENTRY_CATEGORIES = Object.freeze([
  "Work",
  "Leadership",
  "Community service",
  "Activities",
  "Awards & honors",
  "Academic projects",
]);
const RESUME_ENTRY_CATEGORY_SET = new Set(RESUME_ENTRY_CATEGORIES);

export const RESOURCE_AID_CHECKLIST = Object.freeze([
  { id: "fsa-account", label: "Create or confirm your StudentAid.gov account", detail: "Each required contributor uses their own account. Never share account passwords." },
  { id: "records-ready", label: "Gather the records needed for the FAFSA", detail: "Check the current Federal Student Aid checklist for tax, income, asset, and contributor information." },
  { id: "school-list", label: "Make a list of every school you are considering", detail: "Add schools to the FAFSA even if you have not applied yet, then follow each school's instructions." },
  { id: "deadlines", label: "Check federal, state, and college priority deadlines", detail: "State and school deadlines can be earlier than the federal deadline. Record each separately." },
  { id: "submit-fafsa", label: "Submit the correct FAFSA form when available", detail: "Use the award year that matches when you plan to attend. Check StudentAid.gov for the current opening date." },
  { id: "submission-summary", label: "Review the FAFSA Submission Summary", detail: "Check your answers, eligibility information, school list, and any corrections or next steps." },
  { id: "school-portals", label: "Check every college financial-aid portal", detail: "Respond to document requests and verification notices by the school's own deadline." },
  { id: "compare-offers", label: "Compare written aid offers side by side", detail: "Use total cost minus grants and scholarships to estimate net price." },
  { id: "separate-aid", label: "Separate grants, scholarships, work-study, and loans", detail: "Work-study is earned through work; loans must be repaid. Do not treat either as gift aid." },
  { id: "renewal-rules", label: "Confirm renewal rules and award conditions", detail: "Check GPA, credit-load, major, enrollment, and annual reapplication requirements." },
]);

export const RESOURCE_CALENDAR = Object.freeze([
  {
    id: "spring-junior",
    label: "March–April · Junior year",
    title: "Build your foundation",
    tasks: [
      { id: "calendar-story-bank", label: "Make a list of activities, work, service, honors, and responsibilities." },
      { id: "calendar-search-themes", label: "Identify scholarship themes that fit your interests and experiences." },
      { id: "calendar-counselor", label: "Ask your counselor where your school and community publish local awards." },
    ],
  },
  {
    id: "late-spring-junior",
    label: "May · Junior year",
    title: "Prepare your materials",
    tasks: [
      { id: "calendar-resume", label: "Create a one-page activities and accomplishments resume." },
      { id: "calendar-recommenders", label: "Identify teachers or mentors who could write recommendations later." },
      { id: "calendar-transcript", label: "Learn how to request an official transcript and confirm your records." },
    ],
  },
  {
    id: "summer-before-senior",
    label: "June–August · Before senior year",
    title: "Get application-ready",
    tasks: [
      { id: "calendar-shortlist", label: "Build a shortlist and verify each award on its official sponsor page." },
      { id: "calendar-essay-plan", label: "Draft reusable essay ideas, then tailor each response to its exact prompt." },
      { id: "calendar-documents", label: "Collect non-sensitive application materials and note how to request replacements." },
      { id: "calendar-deadlines", label: "Put confirmed deadlines, opening dates, and recommendation lead times on a calendar." },
    ],
  },
  {
    id: "september-senior",
    label: "September · Senior year",
    title: "Set your application routine",
    tasks: [
      { id: "calendar-portal", label: "Create a simple system for checking each college and scholarship portal." },
      { id: "calendar-local-awards", label: "Ask your counselor about school, district, employer, and community awards." },
      { id: "calendar-reference-requests", label: "Give recommenders clear instructions and plenty of lead time." },
    ],
  },
  {
    id: "october-senior",
    label: "October · Senior year",
    title: "Start the financial-aid process",
    tasks: [
      { id: "calendar-fafsa", label: "Check whether the FAFSA for your intended award year is available and submit it when appropriate." },
      { id: "calendar-priority-awards", label: "Prioritize scholarships with early or priority deadlines." },
      { id: "calendar-school-requirements", label: "Check whether your state or colleges require additional aid forms." },
    ],
  },
  {
    id: "november-december-senior",
    label: "November–December · Senior year",
    title: "Keep applications moving",
    tasks: [
      { id: "calendar-essay-review", label: "Revise essays for the exact prompt, word limit, and sponsor mission." },
      { id: "calendar-submit-early", label: "Submit completed applications ahead of their confirmed deadlines." },
      { id: "calendar-submission-proof", label: "Save submission confirmations and record the date you applied." },
    ],
  },
  {
    id: "january-february-senior",
    label: "January–February · Senior year",
    title: "Follow up and fill gaps",
    tasks: [
      { id: "calendar-aid-summary", label: "Review your FAFSA Submission Summary and resolve listed issues." },
      { id: "calendar-portal-followup", label: "Check college portals for missing documents and verification requests." },
      { id: "calendar-new-awards", label: "Search for spring awards and scholarships with later deadlines." },
    ],
  },
  {
    id: "march-april-senior",
    label: "March–April · Senior year",
    title: "Compare your options",
    tasks: [
      { id: "calendar-compare-offers", label: "Compare written financial-aid offers using net price, not sticker price alone." },
      { id: "calendar-ask-questions", label: "Ask each financial-aid office about unclear terms or changed circumstances." },
      { id: "calendar-award-conditions", label: "Verify scholarship renewal terms, disbursement timing, and conditions." },
    ],
  },
  {
    id: "may-june-senior",
    label: "May–June · Senior year",
    title: "Close the loop",
    tasks: [
      { id: "calendar-enrollment", label: "Confirm your college choice and complete the school's enrollment steps." },
      { id: "calendar-thank-you", label: "Thank recommenders and notify scholarship sponsors when required." },
      { id: "calendar-renewal", label: "Record renewal deadlines and requirements for awards you accept." },
    ],
  },
]);

const ESSAY_FIELDS = Object.freeze([
  "scholarshipName", "prompt", "wordLimit", "promptInMyWords", "coreMessage",
  "specificStory", "opening", "context", "action", "reflection", "connection", "closing",
]);
const CALENDAR_TASK_IDS = new Set(RESOURCE_CALENDAR.flatMap((stage) => stage.tasks.map((task) => task.id)));
const AID_CHECKLIST_IDS = new Set(RESOURCE_AID_CHECKLIST.map((item) => item.id));
const RESERVED_IDS = new Set(["__proto__", "prototype", "constructor"]);
const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isSafeId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) && !RESERVED_IDS.has(value);
const isNonNegativeAmount = (value) => typeof value === "string" &&
  value.length <= 20 && (value === "" || /^(?:0|[1-9]\d{0,11})(?:\.\d{0,2})?$/.test(value));
const isValidMonth = (value) => typeof value === "string" &&
  (value === "" || /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
const RESUME_ENTRY_FIELDS = Object.freeze([
  "id", "category", "role", "organization", "startDate", "endDate", "details", "impact",
]);

export function createResourceWorkspace() {
  return {
    essayPlan: Object.fromEntries(ESSAY_FIELDS.map((field) => [field, ""])),
    aidChecklist: { completed: [], comparisons: [] },
    calendarCompleted: [],
    resumeEntries: [],
  };
}

export function normalizeResourceWorkspace(input) {
  const empty = createResourceWorkspace();
  if (!isRecord(input)) return empty;

  const rawEssay = isRecord(input.essayPlan) ? input.essayPlan : {};
  for (const field of ESSAY_FIELDS) {
    if (typeof rawEssay[field] === "string") empty.essayPlan[field] = rawEssay[field].slice(0, 8000);
  }

  const aid = isRecord(input.aidChecklist) ? input.aidChecklist : {};
  if (Array.isArray(aid.completed)) {
    empty.aidChecklist.completed = [...new Set(aid.completed.filter((id) => AID_CHECKLIST_IDS.has(id)))];
  }
  if (Array.isArray(aid.comparisons)) {
    const seen = new Set();
    empty.aidChecklist.comparisons = aid.comparisons.slice(0, MAX_RESOURCE_COMPARISONS).flatMap((row) => {
      if (!isRecord(row) || !isSafeId(row.id) || seen.has(row.id)) return [];
      seen.add(row.id);
      return [{
        id: row.id,
        school: typeof row.school === "string" ? row.school.slice(0, 160) : "",
        cost: isNonNegativeAmount(row.cost) ? row.cost : "",
        grants: isNonNegativeAmount(row.grants) ? row.grants : "",
        notes: typeof row.notes === "string" ? row.notes.slice(0, 500) : "",
      }];
    });
  }

  if (Array.isArray(input.calendarCompleted)) {
    empty.calendarCompleted = [...new Set(input.calendarCompleted.filter((id) => CALENDAR_TASK_IDS.has(id)))];
  }

  if (Array.isArray(input.resumeEntries)) {
    const seenResumeIds = new Set();
    empty.resumeEntries = input.resumeEntries.slice(0, MAX_RESUME_ENTRIES).flatMap((row) => {
      if (!isRecord(row) || !isSafeId(row.id) || seenResumeIds.has(row.id)) return [];
      seenResumeIds.add(row.id);

      const startDate = isValidMonth(row.startDate) ? row.startDate : "";
      let endDate = isValidMonth(row.endDate) ? row.endDate : "";
      if (!startDate || (endDate && endDate < startDate)) endDate = "";

      return [{
        id: row.id,
        category: RESUME_ENTRY_CATEGORY_SET.has(row.category) ? row.category : "Activities",
        role: typeof row.role === "string" ? row.role.slice(0, 120) : "",
        organization: typeof row.organization === "string" ? row.organization.slice(0, 160) : "",
        startDate,
        endDate,
        details: typeof row.details === "string" ? row.details.slice(0, 800) : "",
        impact: typeof row.impact === "string" ? row.impact.slice(0, 500) : "",
      }];
    });
  }
  return empty;
}

export function isValidResourceWorkspace(input) {
  if (!isRecord(input) || Object.keys(input).some((key) => !["essayPlan", "aidChecklist", "calendarCompleted", "resumeEntries"].includes(key))) return false;
  if (!isRecord(input.essayPlan) || Object.keys(input.essayPlan).some((key) => !ESSAY_FIELDS.includes(key))) return false;
  if (ESSAY_FIELDS.some((field) => input.essayPlan[field] !== undefined &&
    (typeof input.essayPlan[field] !== "string" || input.essayPlan[field].length > 8000))) return false;

  if (!isRecord(input.aidChecklist) ||
      Object.keys(input.aidChecklist).some((key) => !["completed", "comparisons"].includes(key))) return false;
  const completed = input.aidChecklist.completed;
  const comparisons = input.aidChecklist.comparisons;
  if (!Array.isArray(completed) || completed.length > AID_CHECKLIST_IDS.size ||
      completed.some((id) => typeof id !== "string" || !AID_CHECKLIST_IDS.has(id)) ||
      new Set(completed).size !== completed.length) return false;
  if (!Array.isArray(comparisons) || comparisons.length > MAX_RESOURCE_COMPARISONS) return false;
  const ids = new Set();
  for (const row of comparisons) {
    if (!isRecord(row) || Object.keys(row).some((key) => !["id", "school", "cost", "grants", "notes"].includes(key))) return false;
    if (!isSafeId(row.id) || ids.has(row.id) ||
        typeof row.school !== "string" || row.school.length > 160 ||
        !isNonNegativeAmount(row.cost) || !isNonNegativeAmount(row.grants) ||
        typeof row.notes !== "string" || row.notes.length > 500) return false;
    ids.add(row.id);
  }

  const calendarCompleted = input.calendarCompleted;
  if (!Array.isArray(calendarCompleted) ||
      calendarCompleted.length > CALENDAR_TASK_IDS.size ||
      !calendarCompleted.every((id) => typeof id === "string" && CALENDAR_TASK_IDS.has(id)) ||
      new Set(calendarCompleted).size !== calendarCompleted.length) return false;

  // The field is optional when reading older version-three backups.
  const resumeEntries = input.resumeEntries ?? [];
  if (!Array.isArray(resumeEntries) || resumeEntries.length > MAX_RESUME_ENTRIES) return false;
  const resumeIds = new Set();
  for (const entry of resumeEntries) {
    if (!isRecord(entry) || Object.keys(entry).some((key) => !RESUME_ENTRY_FIELDS.includes(key))) return false;
    if (!isSafeId(entry.id) || resumeIds.has(entry.id) ||
        !RESUME_ENTRY_CATEGORY_SET.has(entry.category) ||
        typeof entry.role !== "string" || entry.role.length > 120 ||
        typeof entry.organization !== "string" || entry.organization.length > 160 ||
        !isValidMonth(entry.startDate) || !isValidMonth(entry.endDate) ||
        (entry.endDate && (!entry.startDate || entry.endDate < entry.startDate)) ||
        typeof entry.details !== "string" || entry.details.length > 800 ||
        typeof entry.impact !== "string" || entry.impact.length > 500) return false;
    resumeIds.add(entry.id);
  }
  return true;
}

export function calculateNetPrice(totalCost, grantAid) {
  if (totalCost === "" || grantAid === "" || totalCost === null || grantAid === null ||
      totalCost === undefined || grantAid === undefined) return null;
  if (!isNonNegativeAmount(String(totalCost)) || !isNonNegativeAmount(String(grantAid))) return null;
  const cost = Number(totalCost);
  const grants = Number(grantAid);
  if (!Number.isFinite(cost) || !Number.isFinite(grants) || cost < 0 || grants < 0) return null;
  return Math.max(0, Math.round((cost - grants + Number.EPSILON) * 100) / 100);
}
