export const DEMO_PROFILE = Object.freeze({
  name: "Taylor Sample",
  grade: "12",
  graduationYear: "2027",
  state: "TX",
  interests: "STEM, community service, writing",
  note: "Fictional student profile for browser testing only.",
});

export const DEMO_SCHOLARSHIPS = Object.freeze([
  {
    id: "demo-northstar-stem",
    name: "Northstar STEM Opportunity",
    provider: "Northstar Learning Foundation",
    award: "$2,500",
    deadline: "April 15, 2027",
    stateEligibility: ["TX", "CA", "AZ"],
    category: "STEM",
    summary: "Synthetic award record for testing search, filters, and details.",
    requirements: ["High-school senior", "Interest in a STEM subject"],
  },
  {
    id: "demo-community-builders",
    name: "Community Builders Award",
    provider: "Civic Futures Lab",
    award: "$1,000",
    deadline: "March 1, 2027",
    stateEligibility: ["TX", "OK", "NM"],
    category: "Community",
    summary: "Synthetic award record with a regional state filter.",
    requirements: ["Documented community project", "Short personal statement"],
  },
  {
    id: "demo-humanities-discovery",
    name: "Humanities Discovery Grant",
    provider: "Open Pages Institute",
    award: "$1,750",
    deadline: "May 20, 2027",
    stateEligibility: ["ALL"],
    category: "Humanities",
    summary: "Synthetic nationwide record for broad search testing.",
    requirements: ["Interest in history, language, or culture", "Writing sample"],
  },
  {
    id: "demo-first-generation",
    name: "First-Generation Futures Award",
    provider: "Next Chapter Foundation",
    award: "$3,000",
    deadline: "February 10, 2027",
    stateEligibility: ["ALL"],
    category: "First-generation",
    summary: "Synthetic record for category and profile workflow testing.",
    requirements: ["First-generation student profile flag", "School counselor reference"],
  },
  {
    id: "demo-creative-discovery",
    name: "Creative Discovery Award",
    provider: "Bright Canvas Collective",
    award: "$900",
    deadline: "June 5, 2027",
    stateEligibility: ["NY", "TX", "WA"],
    category: "Arts",
    summary: "Synthetic record for testing detail views and saved items.",
    requirements: ["Portfolio link or sample", "Short project description"],
  },
]);

export function filterDemoScholarships(
  records,
  { query = "", state = "ALL", category = "ALL" } = {},
) {
  const normalizedQuery = String(query).trim().toLowerCase();
  return records.filter((item) => {
    const matchesQuery = !normalizedQuery ||
      [item.name, item.provider, item.summary, item.category]
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    const matchesState = state === "ALL" ||
      item.stateEligibility.includes("ALL") ||
      item.stateEligibility.includes(state);
    const matchesCategory = category === "ALL" || item.category === category;
    return matchesQuery && matchesState && matchesCategory;
  });
}
