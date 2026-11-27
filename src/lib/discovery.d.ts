/// <reference types="vite/client" />
export type DiscoveryCategoryOption = { id: string; label: string; description: string };
export type DiscoveryQuery = {
  category: string;
  query: string;
  queryVariants: string[];
  sourceUrl: string;
};
export const DISCOVERY_CATEGORY_OPTIONS: DiscoveryCategoryOption[];
export type NormalizedDiscoveryResult = {
  title: string;
  sourceUrl: string;
  domain: string;
  excerpt: string;
  publishedAt: string;
  sourceCategory: string;
  sourceAuthority: "official-sponsor" | "official-program" | "official-school" | "official-government" | "unverified-lead";
  sourceVerified: false;
};
export function buildScholarshipQueries(profile?: Record<string, unknown>, categories?: string[]): DiscoveryQuery[];
export function isSafeHttpsUrl(value: string): boolean;
export function normalizeExaResults(results: unknown[], sourceCategory?: string): NormalizedDiscoveryResult[];
export function pickMatchingProfile(profile: Record<string, unknown>): { state?: string; graduationYear?: string };
