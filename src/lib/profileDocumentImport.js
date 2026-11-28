const PROFILE_FIELDS = new Set([
  'school', 'graduationYear', 'gpa', 'gpaType', 'classRank', 'act', 'sat',
  'apCourses', 'dualCreditCourses', 'academicHonors', 'activities', 'serviceHours',
  'service', 'employment', 'certifications', 'languages', 'plannedMajor', 'interests',
]);

const FIELD_PATTERNS = [
  ['school', /^(?:school|high school|secondary school|institution)\s*[:,-]\s*(.+)$/i],
  ['graduationYear', /^(?:graduation year|expected graduation|anticipated graduation|class of)\s*[:,-]?\s*(20\d{2})\b/i],
  ['gpa', /^(?:cumulative )?gpa\s*[:,-]?\s*(\d(?:\.\d{1,3})?)(?:\s*(?:\/|out of)\s*\d(?:\.\d{1,2})?)?\b/i],
  ['classRank', /^(?:class rank|class standing|rank)\s*[:,-]\s*(.+)$/i],
  ['act', /^(?:act(?: composite)?(?: score)?)\s*[:,-]?\s*(\d{1,2})\b/i],
  ['sat', /^(?:sat(?: total)?(?: score)?)\s*[:,-]?\s*(\d{3,4})\b/i],
  ['apCourses', /^(?:ap courses|advanced placement courses|ap classes)\s*[:,-]\s*(.+)$/i],
  ['dualCreditCourses', /^(?:dual credit courses|dual enrollment courses|college courses)\s*[:,-]\s*(.+)$/i],
  ['academicHonors', /^(?:academic honors|honors|awards|distinctions)\s*[:,-]\s*(.+)$/i],
  ['activities', /^(?:activities|extracurriculars|clubs|leadership)\s*[:,-]\s*(.+)$/i],
  ['serviceHours', /^(?:volunteer hours|service hours|community service hours)\s*[:,-]?\s*(\d+(?:\.\d+)?)\b/i],
  ['service', /^(?:volunteer experience|community service|service experience)\s*[:,-]\s*(.+)$/i],
  ['employment', /^(?:employment|work experience|experience)\s*[:,-]\s*(.+)$/i],
  ['certifications', /^(?:certifications|certificates|licenses)\s*[:,-]\s*(.+)$/i],
  ['languages', /^(?:languages|language skills)\s*[:,-]\s*(.+)$/i],
  ['plannedMajor', /^(?:intended major|planned major|major|field of study)\s*[:,-]\s*(.+)$/i],
  ['interests', /^(?:interests|career interests|academic interests)\s*[:,-]\s*(.+)$/i],
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[;,|]+$/, '').trim();
}

function isValidFieldValue(field, value) {
  if (!value || value.length > 2000) return false;
  if (field === 'graduationYear') return /^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 2100;
  if (field === 'gpa') return /^\d(?:\.\d{1,3})?$/.test(value) && Number(value) >= 0 && Number(value) <= 100;
  if (field === 'gpaType') return /^\d(?:\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 100;
  if (field === 'act') return /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 36;
  if (field === 'sat') return /^\d{3,4}$/.test(value) && Number(value) >= 400 && Number(value) <= 1600;
  if (field === 'serviceHours') return /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) >= 0;
  return true;
}

export function extractProfileDetails(sourceText) {
  if (typeof sourceText !== 'string' || !sourceText.trim() || sourceText.includes('\u0000')) return {};
  const text = sourceText.replace(/\u0000/g, '').slice(0, 1_000_000);
  const result = {};
  for (const rawLine of text.split(/[\r\n]+/)) {
    const line = clean(rawLine);
    if (!line) continue;
    for (const [field, pattern] of FIELD_PATTERNS) {
      if (result[field]) continue;
      const match = line.match(pattern);
      if (!match?.[1]) continue;
      const value = clean(match[1]);
      if (isValidFieldValue(field, value)) result[field] = value;
    }
    if (!result.gpaType) {
      const scale = line.match(/\bGPA\b\s*[:,-]?\s*\d(?:\.\d{1,3})?\s*(?:\/|out of)\s*(\d(?:\.\d{1,2})?)\b/i);
      if (scale && isValidFieldValue('gpaType', scale[1])) result.gpaType = scale[1];
    }
  }
  return result;
}

export function mergeExtractedProfileDetails(profile, extracted) {
  const next = { ...profile };
  for (const [field, rawValue] of Object.entries(extracted ?? {})) {
    if (!PROFILE_FIELDS.has(field) || typeof rawValue !== 'string') continue;
    const value = clean(rawValue);
    if (!isValidFieldValue(field, value)) continue;
    if (typeof next[field] !== 'string' || !next[field].trim()) next[field] = value;
  }
  return next;
}
