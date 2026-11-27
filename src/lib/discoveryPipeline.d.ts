export type LiveDiscoveryRecord = {
  id: string;
  title: string;
  source_url: string;
  source_domain?: string;
  excerpt?: string;
  discovery_category?: string;
  discovery_categories?: string[];
  discovery_query?: string;
  discovery_queries?: string[];
  discovery_page?: number;
  discovery_pages?: number[];
  relevance_score?: number;
  relevance_reasons?: string[];
  [key: string]: unknown;
};
export function rankAndDeduplicateLiveResults(
  results: unknown[],
  profile?: Record<string, unknown>,
): LiveDiscoveryRecord[];
export function canonicalizeDiscoveryUrl(value: string): string | null;
