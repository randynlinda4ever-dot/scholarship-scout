import { canonicalizeUrl, isSafeHttpsUrl, normalizeTitle } from "./scholarship-discovery.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANKING_CUTOFF = 10;
const RECALL_CUTOFF = 50;
const RELEVANT_GRADE = 2;
const canonical = (value) => {
  if (!isSafeHttpsUrl(value)) return null;
  try { return canonicalizeUrl(value); } catch { return null; }
};
const ratio = (numerator, denominator) => ({
  value: denominator > 0 ? numerator / denominator : null,
  numerator,
  denominator,
});
const unavailable = () => ({ value: null, numerator: 0, denominator: 0 });

function normalizeJudgments(queryCase) {
  const judgments = new Map();
  for (const judgment of Array.isArray(queryCase?.relevanceJudgments) ? queryCase.relevanceJudgments : []) {
    const url = canonical(judgment?.url);
    const grade = Number(judgment?.grade);
    if (!url || !Number.isInteger(grade) || grade < 0 || grade > 3) continue;
    judgments.set(url, grade);
  }
  return judgments;
}

function calculateRankingMetrics(queryCase, results) {
  const judgments = normalizeJudgments(queryCase);
  if (judgments.size === 0) {
    return {
      precisionAt10: unavailable(),
      ndcgAt10: unavailable(),
      mrrAt10: unavailable(),
      recallAt50: unavailable(),
      judgedCoverageAt10: unavailable(),
    };
  }

  const ranked = results.map((result) => ({
    url: canonical(result?.url ?? result?.source_url ?? result?.provenance?.[0]?.canonicalUrl),
  }));
  const grades = ranked.map((item) => item.url ? judgments.get(item.url) ?? null : null);
  const top10 = grades.slice(0, RANKING_CUTOFF);
  const top50 = grades.slice(0, RECALL_CUTOFF);
  const judgedTop10 = top10.filter((grade) => grade !== null).length;
  const relevantTop10 = top10.filter((grade) => Number(grade) >= RELEVANT_GRADE).length;
  const relevantTop50 = top50.filter((grade) => Number(grade) >= RELEVANT_GRADE).length;
  const totalRelevant = [...judgments.values()].filter((grade) => grade >= RELEVANT_GRADE).length;

  let reciprocalRank = 0;
  const firstRelevantRank = top10.findIndex((grade) => Number(grade) >= RELEVANT_GRADE);
  if (firstRelevantRank >= 0) reciprocalRank = 1 / (firstRelevantRank + 1);

  const gain = (grade) => grade === null ? 0 : (2 ** grade) - 1;
  const dcg = top10.reduce((total, grade, index) =>
    total + gain(grade) / Math.log2(index + 2), 0);
  const idealGrades = [...judgments.values()].sort((left, right) => right - left).slice(0, RANKING_CUTOFF);
  const idealDcg = idealGrades.reduce((total, grade, index) =>
    total + gain(grade) / Math.log2(index + 2), 0);

  return {
    precisionAt10: ratio(relevantTop10, RANKING_CUTOFF),
    ndcgAt10: ratio(dcg, idealDcg),
    mrrAt10: ratio(reciprocalRank, 1),
    recallAt50: ratio(relevantTop50, totalRelevant),
    judgedCoverageAt10: ratio(judgedTop10, top10.length),
  };
}

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

  const retrievedUrls = new Set(results.map((result) => canonical(result?.url ?? result?.source_url ?? result?.provenance?.[0]?.canonicalUrl)).filter(Boolean));
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
    const url = canonical(result?.url ?? result?.source_url ?? result?.provenance?.[0]?.canonicalUrl);
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
    const url = canonical(result?.url ?? result?.source_url);
    const title = normalizeTitle(result?.title || "");
    if (!url || !title) continue;
    const key = url + "|" + title;
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  const duplicateRate = ratio(duplicates, results.length);
  const rankingMetrics = calculateRankingMetrics(queryCase, results);

  return {
    queryId: queryCase.id,
    status: response?.status || "unavailable",
    resultCount: results.length,
    supportingSourceRecall,
    citationAccuracy,
    freshnessCompliance,
    freshnessUnknown,
    duplicateRate,
    ...rankingMetrics,
  };
}

export function aggregateSearchEvaluations(evaluations) {
  const ratioMetricNames = ["supportingSourceRecall", "citationAccuracy", "freshnessCompliance", "duplicateRate"];
  const macroMetricNames = ["precisionAt10", "ndcgAt10", "mrrAt10", "recallAt50", "judgedCoverageAt10"];
  const metrics = {};
  for (const name of ratioMetricNames) {
    const values = evaluations.map((item) => item?.[name]).filter((item) => item && Number.isFinite(item.numerator) && Number.isFinite(item.denominator));
    const numerator = values.reduce((total, item) => total + item.numerator, 0);
    const denominator = values.reduce((total, item) => total + item.denominator, 0);
    metrics[name] = ratio(numerator, denominator);
  }
  for (const name of macroMetricNames) {
    const values = evaluations.map((item) => item?.[name]?.value).filter(Number.isFinite);
    metrics[name] = {
      value: values.length ? values.reduce((total, value) => total + value, 0) / values.length : null,
      queryCount: values.length,
    };
  }
  return { queryCount: evaluations.length, metrics };
}
