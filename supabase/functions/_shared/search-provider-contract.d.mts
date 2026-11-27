export type SearchStatus = "success" | "partial" | "empty" | "rate_limited" | "unavailable" | "timeout" | "cancelled" | "error";
export type SearchProvenance = {
  provider: string;
  providerRequestId: string | null;
  retrievedAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  canonicalUrl: string;
  originalUrl: string;
  contentHash: string | null;
  freshness: "fresh" | "stale" | "unknown" | "future" | "dated";
};
export type SearchResult = { title: string; url: string; snippet: string; provenance: SearchProvenance[] };
export type SearchResponse = {
  status: SearchStatus;
  provider: string | null;
  results: SearchResult[];
  attempts: Array<{ provider: string; status: SearchStatus; durationMs: number; resultCount: number; error: { code: string | null; retryable: boolean } | null }>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  cache: { hit: boolean; ageMs: number };
  error: { code: string; retryable: boolean } | null;
};
export type SearchRequest = { query: string; limit?: number; maxAgeDays?: number; asOf?: string; signal?: AbortSignal };
export type SearchProvider = { name: string; search(request: SearchRequest): Promise<{ status: SearchStatus; results: Array<Record<string, unknown>>; providerRequestId?: string; error?: { code?: string; retryable?: boolean } }> };
export const SEARCH_STATUSES: readonly SearchStatus[];
export function createSearchProvider(name: string, search: SearchProvider["search"]): SearchProvider;
export function createSearchResponseCache(options?: { now?: () => number | Date; ttlMs?: number; maxEntries?: number }): {
  readonly size: number;
  get(key: string): { value: SearchResponse; ageMs: number } | null;
  set(key: string, value: SearchResponse): boolean;
  clear(): void;
};
export function searchWithFallback(options: {
  providers: SearchProvider[];
  request: SearchRequest;
  cache?: ReturnType<typeof createSearchResponseCache> | null;
  now?: () => number | Date;
  maxProvidersToTry?: number;
  minResults?: number;
  providerTimeoutMs?: number;
  totalTimeoutMs?: number;
  cacheVersion?: string;
}): Promise<SearchResponse>;
