import { classifySourceAuthority, isSafeHttpsUrl, sanitizePublicHttpsUrl } from "./evidence.js";

const SOURCES = {
  web: "https://www.careeronestop.org/Toolkit/Training/find-scholarships.aspx?curPage=1&studyLevelfilter=High+School",
  college: "https://bigfuture.collegeboard.org/scholarship-search",
  aid: "https://studentaid.gov/articles/scholarship-tips/",
};

const CATEGORY_QUERIES = {
  local: (profile) => ({ query: (profile.state ? profile.state + " " : "") + "local scholarships community foundations student awards " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
  school_resources: (profile) => ({ query: "school-based scholarships counselor financial aid office district foundation student awards " + (profile.graduationYear || "") + " official", sourceUrl: SOURCES.web }),
  regional: (profile) => ({ query: (profile.state ? profile.state + " " : "") + "regional scholarships foundations student awards " + (profile.graduationYear || "") + " official", sourceUrl: SOURCES.web }),
  state: (profile) => ({ query: (profile.state ? profile.state + " " : "") + "state scholarship programs education grants student financial aid " + (profile.graduationYear || "") + " official", sourceUrl: SOURCES.aid }),
  academic: (profile) => ({ query: "academic merit scholarships student achievement grades honors " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.college }),
  humanities: (profile) => ({ query: "humanities arts history culture and social science student scholarships " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.college }),
  leadership: (profile) => ({ query: "student leadership civic engagement organization officer scholarships " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
  community_service: (profile) => ({ query: "volunteer community service nonprofit involvement scholarships students " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
  language: (profile) => ({ query: "world language learning bilingual student scholarships " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.college }),
  employment: (profile) => ({ query: "employer workplace career training student scholarships " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
  arts: (profile) => ({ query: "visual art design theater music speech creative student scholarships " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.college }),
  incoming_college: (profile) => ({ query: "incoming college university student scholarships first year " + (profile.graduationYear || "") + " official", sourceUrl: SOURCES.college }),
  national: (profile) => ({ query: "national scholarships for students " + (profile.graduationYear || "") + " official foundations sponsors", sourceUrl: SOURCES.web }),
  general: (profile) => ({ query: "general scholarships for students broad eligibility application requirements " + (profile.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
};
const KNOWN_CATEGORIES = new Set(Object.keys(CATEGORY_QUERIES));

export const DISCOVERY_CATEGORY_OPTIONS = [
  { id: "local", label: "Local opportunities", description: "Nearby scholarships, community foundations, and civic awards." },
  { id: "school_resources", label: "School resources", description: "Scholarship information published by your school or district." },
  { id: "regional", label: "Regional awards", description: "Regional scholarships and community foundations." },
  { id: "state", label: "State programs", description: "State scholarships, grants, and education programs." },
  { id: "academic", label: "Academic merit", description: "Academic achievement, grades, honors, and merit awards." },
  { id: "humanities", label: "Major & interests", description: "Scholarships related to your chosen subject areas and interests." },
  { id: "leadership", label: "Leadership", description: "Student leadership, organizations, and civic engagement." },
  { id: "community_service", label: "Community service", description: "Volunteer work, nonprofit involvement, and service." },
  { id: "language", label: "Language learning", description: "World languages, multilingual skills, and language study." },
  { id: "employment", label: "Employment & careers", description: "Employer, workplace, career, and training-related awards." },
  { id: "arts", label: "Arts & creative work", description: "Visual art, design, theater, music, speech, and creative awards." },
  { id: "incoming_college", label: "College-specific", description: "Incoming-student and university-specific opportunities." },
  { id: "national", label: "National", description: "Scholarships open to students across the country." },
  { id: "general", label: "General", description: "Broad awards without a narrow major or activity restriction." },
];

function clean(value, maxLength) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function buildScholarshipQueries(profile = {}, categories = []) {
  const safeProfile = {
    state: clean(profile.state, 60),
    graduationYear: /^\d{4}$/.test(clean(profile.graduationYear, 4))
      ? clean(profile.graduationYear, 4)
      : "",
  };
  const unique = [...new Set((Array.isArray(categories) ? categories : [])
    .filter((item) => typeof item === "string" && KNOWN_CATEGORIES.has(item)))];
  return unique.map((category) => {
    const built = CATEGORY_QUERIES[category](safeProfile);
    const primaryQuery = clean(built.query, 600);
    const alternateQuery = clean(primaryQuery + " application requirements eligibility deadline official scholarship sponsor", 600);
    return { category, query: primaryQuery, queryVariants: [...new Set([primaryQuery, alternateQuery])], sourceUrl: built.sourceUrl };
  });
}

export function normalizeExaResults(results, sourceCategory = "general") {
  if (!Array.isArray(results)) return [];
  const output = [];
  for (const item of results) {
    if (!item) continue;
    const sourceUrl = sanitizePublicHttpsUrl(item.url);
    if (!sourceUrl) continue;
    const title = clean(item.title, 220);
    if (!title) continue;
    output.push({
      title,
      sourceUrl,
      domain: clean(new URL(sourceUrl).hostname, 160),
      excerpt: clean(item.text || (Array.isArray(item.highlights) ? item.highlights.join(" ") : ""), 1800),
      publishedAt: clean(item.publishedDate, 40),
      sourceCategory,
      sourceAuthority: classifySourceAuthority(item.url),
      sourceVerified: false,
    });
  }
  return output;
}

export function pickMatchingProfile(profile = {}) {
  // Only broad state and graduation year may leave the browser for live search.
  // School, district, academic records, activities, contact data, and sensitive details stay local.
  return {
    ...(profile?.state ? { state: clean(profile.state, 40) } : {}),
    ...(profile?.graduationYear ? { graduationYear: clean(profile.graduationYear, 4) } : {}),
  };
}

export { isSafeHttpsUrl };
