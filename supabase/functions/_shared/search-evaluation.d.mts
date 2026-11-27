import type { SearchResponse } from "./search-provider-contract.mjs";
export type GoldenSource = { url: string; supportedClaims: string[]; maxAgeDays: number; authority: string };
export type GoldenQuery = { id: string; query: string; category: string; asOf: string; maxAgeDays: number; expectedSources: GoldenSource[] };
export type EvaluationMetric = { value: number | null; numerator: number; denominator: number };
export type SearchEvaluation = {
  queryId: string;
  status: string;
  resultCount: number;
  supportingSourceRecall: EvaluationMetric;
  citationAccuracy: EvaluationMetric;
  freshnessCompliance: EvaluationMetric;
  freshnessUnknown: number;
  duplicateRate: EvaluationMetric;
};
export function evaluateGoldenQuery(queryCase: GoldenQuery, response: Partial<SearchResponse>, options?: { citations?: Array<{ url?: string; sourceUrl?: string; claimId: string }> }): SearchEvaluation;
export function aggregateSearchEvaluations(evaluations: SearchEvaluation[]): { queryCount: number; metrics: Record<"supportingSourceRecall" | "citationAccuracy" | "freshnessCompliance" | "duplicateRate", EvaluationMetric> };
