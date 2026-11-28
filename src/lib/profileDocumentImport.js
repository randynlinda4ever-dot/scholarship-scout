const FIELD_PATTERNS = [
  ['school', /^(?:school|high school|secondary school|institution)\s*[:,-]\s*(.+)$/i],
  ['graduationYear', /^(?:graduation year|expected graduation|anticipated graduation|class of)\s*[:,-]\s*(20\d{2})\b/i],
  ['gpa', /^(?:cumulative )?gpa\s*[:,-]\s*(\d(?:\.\d{1,3})?)/i],
  ['classRank', /^(?:class rank|class standing|rank)\s*[:,-]\s*(.+)$/i],
  ['act', /^(?:act(?: composite)?(?: score)?)\s*[:,-]\s*(\d{1,2})\b/i],
  ['sat', /^(?:sat(?: total)?(?: score)?)\s*[:,-]\s*(\d{3,4})\b/i],
  ['apCourses', /^(?:ap courses|advanced placement courses|ap classes)\s*[:,-]\s*(.+)$/i],
  ['dualCreditCourses', /^(?:dual credit courses|dual enrollment courses|college courses)\s*[:,-]\s*(.+)$/i],
  ['academicHonors', /^(?:academic honors|honors|awards|distinctions)\s*[:,-]\s*(.+)$/i],
  ['activities', /^(?:activities|extracurriculars|clubs|leadership)\s*[:,-]\s*(.+)$/i],
  ['serviceHours', /^(?:volunteer hours|service hours|community service hours)\s*[:,-]\s*(\d+(?:\.\d+)?)\b/i],
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

export function extractProfileDetails(sourceText) {
  const text = String(sourceText ?? '').replace(/\u0000/g, '').slice(0, 1_000_000);
  const lines = text.split(/[\r\n]+/).map(clean).filter(Boolean);
  const result = {};
  for (const line of lines) {
    for (const [field, pattern] of FIELD_PATTERNS) {
      if (result[field]) continue;
      const match = line.match(pattern);
      if (!match?.[1]) continue;
      const value = clean(match[1]);
      if (value) result[field] = value.slice(0, 2000);
    }
    if (!result.gpaType) {
      const scale = line.match(/\bGPA\b[^\n]{0,40}?\b(?:out of|/)\s*(\d(?:\.\d{1,2})?)\b/i);
      if (scale) result.gpaType = scale[1];
    }
  }
  if (result.gpa && !result.gpaType) {
    const scale = text.match(/\bGPA\s*[:,-]?\s*\d(?:\.\d{1,3})?\s*(?:\/|out of)\s*(\d(?:\.\d{1,2})?)\b/i);
    if (scale) result.gpaType = scale[1];
  }
  if (result.act && (Number(result.act) < 1 || Number(result.act) > 36)) delete result.act;
  if (result.sat && (Number(result.sat) < 400 || Number(result.sat) > 1600)) delete result.sat;
  if (result.graduationYear && (Number(result.graduationYear) < 1900 || Number(result.graduationYear) > 2100)) delete result.graduationYear;
  return result;
}

export function mergeExtractedProfileDetails(profile, extracted) {
  const next = { ...profile };
  for (const [field, value] of Object.entries(extracted ?? {})) {
    if (typeof value !== 'string' || !value.trim()) continue;
    if (typeof next[field] !== 'string' || !next[field].trim()) next[field] = value.trim();
  }
  return next;
}
