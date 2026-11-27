import { classifySourceAuthority, isSafeHttpsUrl, sanitizePublicHttpsUrl } from "./evidence.js";

const SOURCES = {
  web: "https://www.careeronestop.org/Toolkit/Training/find-scholarships.aspx?curPage=1&studyLevelfilter=High+School",
  college: "https://bigfuture.collegeboard.org/scholarship-search",
  aid: "https://studentaid.gov/articles/scholarship-tips/",
};

const CATEGORY_QUERIES = {
  local: (p) => {
    const place = [p.county, p.state].filter(Boolean).join(", ");
    return { query: (place ? '"' + place + '" ' : "") + "local scholarships community foundations student awards " + (p.grade || "students") + " " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web };
  },
  school_resources: (p) => {
    const institution = [p.school, p.district].filter(Boolean).join(" ");
    return { query: institution ? '"' + institution + '" scholarships financial aid counselor school awards ' + (p.graduationYear || "") + " official" : "school-based scholarships counselor financial aid office student awards " + (p.graduationYear || "") + " official", sourceUrl: SOURCES.web };
  },
  regional: (p) => ({ query: ([p.county, p.state].filter(Boolean).join(" ") || "regional and community") + " scholarships foundations student awards " + (p.graduationYear || "") + " official", sourceUrl: SOURCES.web }),
  state: (p) => ({ query: (p.state ? p.state + " " : "") + "state scholarship programs education grants student financial aid " + (p.graduationYear || "") + " official", sourceUrl: SOURCES.aid }),
  academic: (p) => ({ query: "academic merit scholarships student achievement grades honors " + (p.grade || "students") + " " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.college }),
  humanities: (p) => ({ query: ([p.plannedMajor, p.interests].filter(Boolean).join(" ") || "humanities arts and social sciences") + " scholarships students " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.college }),
  leadership: (p) => ({ query: "student leadership civic engagement organization officer scholarships " + (p.grade || "students") + " " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
  community_service: (p) => ({ query: "volunteer community service nonprofit involvement scholarships students " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
  language: (p) => ({ query: (p.languages || "world language and multilingual") + " language learning bilingual student scholarships " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.college }),
  employment: (p) => ({ query: "employer workplace career training student scholarships " + (p.careerInterests || "") + " " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
  arts: (p) => ({ query: "visual art design theater music speech creative student scholarships " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.college }),
  incoming_college: (p) => ({ query: (p.plannedCollege ? '"' + p.plannedCollege + '" ' : "") + "incoming college university student scholarships first year " + (p.graduationYear || "") + " official", sourceUrl: SOURCES.college }),
  national: (p) => ({ query: "national scholarships for students " + (p.grade || "") + " " + (p.graduationYear || "") + " official foundations sponsors", sourceUrl: SOURCES.web }),
  general: (p) => ({ query: "general scholarships for students broad eligibility application requirements " + (p.graduationYear || "") + " official sponsor", sourceUrl: SOURCES.web }),
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
    county: clean(profile.county, 80),
    district: clean(profile.district, 100),
    school: clean(profile.school, 120),
    grade: clean(profile.grade, 60),
    graduationYear: clean(profile.graduationYear, 4),
    plannedMajor: clean(profile.plannedMajor, 100),
    plannedCollege: clean(profile.plannedCollege, 120),
    interests: clean(profile.interests, 180),
    careerInterests: clean(profile.careerInterests, 120),
    languages: clean(profile.languages, 100),
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
