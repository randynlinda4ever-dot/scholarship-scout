import { canonicalizeUrl, isSafeHttpsUrl, normalizeTitle } from "./scholarship-discovery.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const canonical = (value) => {
  if (!isSafeHttpsUrl(value)) return null;
  try { return canonicalizeUrl(value); } catch { return null; }
};
const ratio = (numerator, denominator) => ({
  value: denominator > 0 ? numerator / denominator : null,
  numerator,
  denominator,
});

export function evaluateGoldenQuery(queryCase, response, { citations = [] } = {}) {
  if (!queryCase || typeof queryCase !== "object" || !Array.isArray(queryCase.expectedSources)) {
    throw new TypeError("A golden query with expectedSources is required.");
  }
  const asOf = Date.parse(queryCase.asOf);
  if (!Number.isFinite(asOf)) throw new TypeError("The golden query requires a valid asOf date.");
  const results = Array.isArray(response?.results) ? response.results : [];
  const expected = new Map();
  for (const source of queryCase.expectedSources) {
    const url = canonical(source.url);
    if (url) expected.set(url, source);
  }

  const retrievedUrls = new Set(results.map((result) => canonical(result?.url ?? result?.provenance?.[0]?.canonicalUrl)).filter(Boolean));
  const recalled = [...expected.keys()].filter((url) => retrievedUrls.has(url)).length;
  const supportingSourceRecall = ratio(recalled, expected.size);

  let citationCorrect = 0;
  for (const citation of citations) {
    const url = canonical(citation?.url ?? citation?.sourceUrl);
    const source = url ? expected.get(url) : null;
    if (source && Array.isArray(source.supportedClaims) && source.supportedClaims.includes(citation?.claimId)) citationCorrect += 1;
  }
  const citationAccuracy = ratio(citationCorrect, citations.length);

  let fresh = 0;
  let freshnessUnknown = 0;
  for (const result of results) {
    const url = canonical(result?.url ?? result?.provenance?.[0]?.canonicalUrl);
    const source = url ? expected.get(url) : null;
    const maxAgeDays = Number.isFinite(source?.maxAgeDays) ? source.maxAgeDays : queryCase.maxAgeDays;
    const provenance = Array.isArray(result?.provenance) ? result.provenance : [];
    const dates = provenance
      .map((entry) => entry?.updatedAt || entry?.publishedAt)
      .map((value) => Date.parse(value || ""))
      .filter(Number.isFinite);
    const bestDate = dates.length ? Math.max(...dates) : NaN;
    if (!Number.isFinite(bestDate)) {
      freshnessUnknown += 1;
      continue;
    }
    const ageMs = asOf - bestDate;
    if (ageMs >= 0 && Number.isFinite(maxAgeDays) && ageMs <= maxAgeDays * DAY_MS) fresh += 1;
  }
  const freshnessCompliance = ratio(fresh, results.length);

  const seen = new Set();
  let duplicates = 0;
  for (const result of results) {
    const url = canonical(result?.url);
    const title = normalizeTitle(result?.title || "");
    if (!url || !title) continue;
    const key = url + "|" + title;
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  const duplicateRate = ratio(duplicates, results.length);

  return {
    queryId: queryCase.id,
    status: response?.status || "unavailable",
    resultCount: results.length,
    supportingSourceRecall,
    citationAccuracy,
    freshnessCompliance,
    freshnessUnknown,
    duplicateRate,
  };
}

export function aggregateSearchEvaluations(evaluations) {
  const metricNames = ["supportingSourceRecall", "citationAccuracy", "freshnessCompliance", "duplicateRate"];
  const metrics = {};
  for (const name of metricNames) {
    const values = evaluations.map((item) => item?.[name]).filter((item) => item && Number.isFinite(item.numerator) && Number.isFinite(item.denominator));
    const numerator = values.reduce((total, item) => total + item.numerator, 0);
    const denominator = values.reduce((total, item) => total + item.denominator, 0);
    metrics[name] = ratio(numerator, denominator);
  }
  return { queryCount: evaluations.length, metrics };
}
