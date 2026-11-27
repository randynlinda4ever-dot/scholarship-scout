const MAX_CATEGORIES = 4;
const MAX_SEARCH_PAGE = 2;
const MAX_RESULTS = 40;
const SEARCH_CONCURRENCY = 4;
const MAX_BODY_BYTES = 8192;
const PUBLIC_RATE_LIMIT_WINDOW_MS = 60_000;
const PUBLIC_RATE_LIMIT_MAX_REQUESTS = 2;
const DISCOVERY_CACHE_TTL_MS = 30_000;
const DISCOVERY_CACHE_MAX_ENTRIES = 100;
const MIN_UNIQUE_RESULTS_PER_CATEGORY = 8;
const MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 150;
const MAX_RETRY_DELAY_MS = 1_000;
const MAX_TOTAL_SEARCH_BUDGET_MS = 22_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
import { normalizeUsState, stateMatchesText } from "./us-states.mjs";
export const ALLOWED_CATEGORIES = Object.freeze([
  "local", "school_resources", "regional", "state", "academic", "humanities",
  "leadership", "community_service", "language", "employment", "arts",
  "incoming_college", "national", "general",
]);
const clean = (value, maxLength) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
function parseRetryAfterDelayMs(value, nowMs) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw) * 1000;
  const retryAt = Date.parse(raw);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : Number.NaN;
}
const CATEGORY_VARIATIONS = {
  local: ["local and county student scholarships, community foundations, and civic organization awards", "nearby scholarships for students and residents, official community foundation and sponsor pages"],
  school_resources: ["school scholarship resources, counselor pages, and public financial aid information", "school and district scholarship announcements and student financial aid resources"],
  regional: ["regional student scholarship programs and community foundations", "regional scholarships and education awards published by official sponsors"],
  state: ["statewide scholarship programs and education grants for students", "state resident scholarships and financial aid, official government and sponsor application pages"],
  academic: ["academic merit scholarships for students, grades, honors, and achievement", "scholarships for students with strong academic records, official foundation and sponsor rules"],
  humanities: ["humanities, history, culture, social science, and writing scholarships for students", "scholarships for students interested in cultural heritage, humanities, research, and writing"],
  leadership: ["student leadership, organization officer, civic engagement, and youth leadership scholarships", "scholarships for student leaders and community leadership, official sponsor rules"],
  community_service: ["volunteer service, nonprofit involvement, and community service scholarships", "scholarships recognizing student volunteering and documented community impact"],
  language: ["world language learning, multilingual students, and language study scholarships", "scholarships for language learning and bilingual achievement, official sponsor rules"],
  employment: ["employer sponsored scholarships, workplace scholarships, and career training awards", "career and workplace scholarships for students, official employer foundation pages"],
  arts: ["visual art, design, theater, music, speech, and creative student scholarships", "creative arts and performance scholarships, official sponsor application pages"],
  incoming_college: ["incoming college student scholarships and first year university awards", "new college student merit scholarships and department awards, official university pages"],
  national: ["national scholarships open to students across the United States", "national student scholarship programs, official foundations and sponsors"],
  general: ["general student scholarships with broad eligibility requirements", "broad eligibility scholarships for students, official sponsor application pages"],
};
export function getPublicClientAddress(req) {
  // Cloudflare overwrites cf-connecting-ip at its edge. Never trust x-real-ip.
  const address = req.headers.get("cf-connecting-ip")?.trim() ?? "";
  if (!address || address.length > 128 || !/^[a-f0-9:.]+$/i.test(address)) return null;
  return address.toLowerCase();
}

// Local/test fallback only. Production injects createUpstashRateLimiter.
export function createPublicRateLimiter({ now = () => Date.now(), maxBuckets = 5000 } = {}) {
  const buckets = new Map();
  return (req) => {
    const address = getPublicClientAddress(req);
    if (!address) return { allowed: false, unattributed: true, retryAfterSeconds: 0 };
    const current = now();
    let bucket = buckets.get(address);
    if (bucket && current - bucket.windowStartedAt >= PUBLIC_RATE_LIMIT_WINDOW_MS) {
      buckets.delete(address);
      bucket = null;
    }
    if (!bucket) {
      if (buckets.size >= maxBuckets) {
        // Reclaim only expired entries; never evict an active client's window.
        for (const [key, entry] of buckets) {
          if (current - entry.windowStartedAt >= PUBLIC_RATE_LIMIT_WINDOW_MS) buckets.delete(key);
          if (buckets.size < maxBuckets) break;
        }
      }
      if (buckets.size >= maxBuckets) return { allowed: false, retryAfterSeconds: 1 };
      bucket = { windowStartedAt: current, count: 0 };
      buckets.set(address, bucket);
    }
    if (bucket.count >= PUBLIC_RATE_LIMIT_MAX_REQUESTS) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((PUBLIC_RATE_LIMIT_WINDOW_MS - (current - bucket.windowStartedAt)) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

export function createUpstashRateLimiter({
  url,
  token,
  fetchImpl = fetch,
  maxRequests = PUBLIC_RATE_LIMIT_MAX_REQUESTS,
  windowMs = PUBLIC_RATE_LIMIT_WINDOW_MS,
} = {}) {
  const endpoint = String(url ?? "").trim();
  const secret = String(token ?? "");
  const script = [
    "local count = redis.call('INCR', KEYS[1])",
    "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
    "local ttl = redis.call('PTTL', KEYS[1])",
    "return {count, ttl}",
  ].join("\n");
  return async (req) => {
    if (!endpoint || secret.length < 32) return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
    const address = getPublicClientAddress(req);
    if (!address) return { allowed: false, unattributed: true, retryAfterSeconds: 0 };
    try {
      const parsedUrl = new URL(endpoint);
      if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password || parsedUrl.port) {
        return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
      }
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(address));
      const digest = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetchImpl(parsedUrl.href, {
        method: "POST",
        headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(["EVAL", script, "1", "scholarship-discover:rate:v1:" + digest, String(windowMs)]),
        signal: AbortSignal.timeout(2500),
        redirect: "error",
      });
      if (!response.ok) return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
      const payload = await response.json();
      const count = Array.isArray(payload?.result) ? Number(payload.result[0]) : NaN;
      const ttl = Array.isArray(payload?.result) ? Number(payload.result[1]) : NaN;
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(ttl) || ttl < 0) {
        return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
      }
      if (count > maxRequests) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)) };
      return { allowed: true, retryAfterSeconds: 0 };
    } catch {
      return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
    }
  };
}
export function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal" || host === "metadata") return false;
    if (host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || !host.includes(".")) return false;
    return true;
  } catch { return false; }
}
export function canonicalizeUrl(value) {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  const privateParameter = /(?:email|e_mail|phone|mobile|telephone|tel|first.?name|last.?name|full.?name|student|user.?id|account.?id|member.?id|contact|recipient|profile|address|birth|dob|ssn|social.?security|token|auth|authorization|password|secret|session|cookie|api.?key|client.?key|access.?key|credential|verification.?code)/i;
  const privateValue = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:^|\D)\d{3}[- .]?\d{2}[- .]?\d{4}(?:\D|$)|(?:^|\D)\+?\d[\d ().-]{6,}\d(?:\D|$))/i;
  for (const [key, entry] of [...url.searchParams.entries()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"].includes(lower) ||
        privateParameter.test(key) || privateValue.test(entry)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}
export function normalizeTitle(value) {
  return clean(value, 220).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function buildSearchJobs(state, graduationYear, categories) {
  const jobs = [];
  for (const category of categories) {
    const variations = CATEGORY_VARIATIONS[category] || [];
    for (let variationIndex = 0; variationIndex < variations.length; variationIndex += 1) {
      const variation = variations[variationIndex];
      const query = clean(`${variation} ${state} ${graduationYear} scholarship application eligibility`, 600);
      for (let page = 1; page <= MAX_SEARCH_PAGE; page += 1) {
        jobs.push({ category, query, page, variation: variationIndex + 1 });
      }    }
  }
  return jobs;
}
function calculateRelevance(title, excerpt, domain, state, year) {
  const searchableText = `${title} ${excerpt}`;
  const searchable = searchableText.toLowerCase();
  const reasons = [];
  let score = 0;
  if (stateMatchesText(searchableText, state)) { score += 4; reasons.push("Matches the selected state"); }
  if (searchable.includes(String(year))) { score += 4; reasons.push(`Mentions class of ${year}`); }
  if (/scholarship|fellowship|grant|student award/.test(searchable)) { score += 2; reasons.push("Mentions a scholarship or award"); }
  if (/high school|high-school|graduating senior|graduating student|class of/.test(searchable)) { score += 2; reasons.push("Mentions high-school or senior applicants"); }
  if (domain.endsWith(".gov") || domain.endsWith(".edu")) { score += 1; reasons.push("Institutional domain signal; sponsor still needs verification"); }
  return { score, reasons };
}
export async function fetchSearchPage(gatewayBase, gatewayToken, job, {
  fetchImpl = fetch,
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxRetries = MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  deadlineAt = Number.POSITIVE_INFINITY,
  clock = () => Date.now(),
} = {}) {
  const searchUrl = new URL("/search", gatewayBase);
  searchUrl.searchParams.set("q", job.query);
  searchUrl.searchParams.set("pageno", String(job.page));
  let retryAttempts = 0;
  try {
    while (true) {
      const remainingMs = deadlineAt - clock();
      if (remainingMs <= 0) return { ok: false, job, failureCode: "search_budget_exhausted", retryAttempts };
      const response = await fetchImpl(searchUrl, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${gatewayToken}` },
        redirect: "error",
        signal: AbortSignal.timeout(Math.max(1, Math.min(12_000, remainingMs))),
      });
      const finalResponseUrl = response.url || searchUrl.href;
      if (response.redirected || !isSafeHttpsUrl(finalResponseUrl) || new URL(finalResponseUrl).href !== searchUrl.href) {
        return { ok: false, job, failureCode: "unsafe_response_url", retryAttempts };
      }
      if (response.ok) {
        const payload = await response.json();
        if (!Array.isArray(payload?.results)) return { ok: false, job, status: 502, failureCode: "invalid_response_payload", retryAttempts };
        return { ok: true, job, results: payload.results.slice(0, 15), retryAttempts };
      }
      if (!RETRYABLE_STATUSES.has(response.status) || retryAttempts >= maxRetries) {
        return { ok: false, job, status: response.status, retryAttempts };
      }
      const retryAfter = response.headers?.get?.("retry-after");
      const requestedDelay = retryAfter == null
        ? retryDelayMs
        : parseRetryAfterDelayMs(retryAfter, clock());
      if (!Number.isFinite(requestedDelay) || requestedDelay < 0 || requestedDelay > MAX_RETRY_DELAY_MS) {
        return { ok: false, job, status: response.status, retryAttempts };
      }
      if (deadlineAt - clock() <= requestedDelay) return { ok: false, job, status: response.status, failureCode: "search_budget_exhausted", retryAttempts };
      await sleepImpl(Math.ceil(requestedDelay));
      retryAttempts += 1;
    }
  } catch {
    return { ok: false, job, failureCode: "network_error", retryAttempts };
  }
}
export async function runBoundedSearches(gatewayBase, gatewayToken, jobs, {
  fetchImpl = fetch,
  sleepImpl,
  maxRetries = MAX_RETRIES,
  concurrency = SEARCH_CONCURRENCY,
  deadlineAt = Number.POSITIVE_INFINITY,
  clock = () => Date.now(),
} = {}) {
  const outcomes = new Array(jobs.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= jobs.length) return;
      outcomes[index] = await fetchSearchPage(gatewayBase, gatewayToken, jobs[index], { fetchImpl, sleepImpl, maxRetries, deadlineAt, clock });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  return outcomes;
}
function countDistinctCategoryResults(outcomes, category) {
  const unique = new Set();
  for (const outcome of outcomes) {
    if (!outcome.ok || outcome.job.category !== category) continue;
    for (const item of outcome.results) {
      const title = clean(item?.title, 220);
      if (!title || !isSafeHttpsUrl(item?.url)) continue;
      try { unique.add(`${canonicalizeUrl(item.url)}|${normalizeTitle(title)}`); } catch { /* malformed result */ }
    }
  }
  return unique.size;
}
/**
 * Search each selected category broadly first, then expand only categories
 * whose first pages yielded too few distinct, usable source leads.
 * The full four-query fallback remains available for low-yield categories.
 */
export async function runAdaptiveSearches(gatewayBase, gatewayToken, jobs, {
  minimumUniqueResults = MIN_UNIQUE_RESULTS_PER_CATEGORY,
  totalBudgetMs = MAX_TOTAL_SEARCH_BUDGET_MS,
  clock = () => Date.now(),
  ...searchOptions
} = {}) {
  const threshold = Math.max(1, Math.min(15, Math.floor(Number(minimumUniqueResults) || MIN_UNIQUE_RESULTS_PER_CATEGORY)));
  const deadlineAt = clock() + Math.max(1, Math.min(MAX_TOTAL_SEARCH_BUDGET_MS, Number(totalBudgetMs) || MAX_TOTAL_SEARCH_BUDGET_MS));
  const outcomes = [];
  const categoryKeys = new Map();
  for (const job of jobs) if (!categoryKeys.has(job.category)) categoryKeys.set(job.category, new Set());
  for (const [variation, page] of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
    if (deadlineAt - clock() <= 0) break;
    const stageJobs = jobs.filter((job) =>
      Number(job.variation ?? 1) === variation &&
      Number(job.page) === page &&
      (variation === 1 && page === 1 || (categoryKeys.get(job.category)?.size ?? 0) < threshold)
    );
    if (!stageJobs.length) continue;
    const stageOutcomes = await runBoundedSearches(gatewayBase, gatewayToken, stageJobs, {
      ...searchOptions,
      deadlineAt,
      clock,
    });
    outcomes.push(...stageOutcomes);
    for (const outcome of stageOutcomes) {
      if (!outcome.ok) continue;
      const keys = categoryKeys.get(outcome.job.category) ?? new Set();
      categoryKeys.set(outcome.job.category, keys);
      for (const item of outcome.results) {
        const title = clean(item?.title, 220);
        if (!title || !isSafeHttpsUrl(item?.url)) continue;
        try { keys.add(`${canonicalizeUrl(item.url)}|${normalizeTitle(title)}`); } catch { /* malformed result */ }
      }
    }
  }
  return outcomes;
}
export function createDiscoveryResultCache({
  now = () => Date.now(),
  ttlMs = DISCOVERY_CACHE_TTL_MS,
  maxEntries = DISCOVERY_CACHE_MAX_ENTRIES,
} = {}) {
  const entries = new Map();
  const prune = () => {
    const current = now();
    for (const [key, entry] of entries) {
      if (!Number.isFinite(current - entry.createdAt) || current - entry.createdAt >= ttlMs) entries.delete(key);
    }
  };
  const clone = (value) => structuredClone(value);
  return {
    get size() { prune(); return entries.size; },
    get(key) {
      prune();
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      entries.set(key, entry);
      return { value: clone(entry.value), ageMs: Math.max(0, now() - entry.createdAt) };
    },
    set(key, value) {
      if (typeof key !== "string" || !key || ttlMs <= 0 || maxEntries <= 0) return false;
      prune();
      if (entries.has(key)) entries.delete(key);
      while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(key, { createdAt: now(), value: clone(value) });
      return true;
    },
    clear() { entries.clear(); },
  };
}
export function normalizeAndRankResults(outcomes, discoveredAt, state, graduationYear, { randomUUID = () => crypto.randomUUID() } = {}) {
  const unique = new Map();
  let rawResultCount = 0;
  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    for (const item of outcome.results) {
      rawResultCount += 1;
      if (!isSafeHttpsUrl(item?.url)) continue;
      const title = clean(item.title, 220);
      if (!title) continue;
      let normalizedUrl, domain;
      try {
        normalizedUrl = canonicalizeUrl(item.url);
        domain = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
      } catch { continue; }
      const excerpt = clean(item.content, 1800);
      const normalized = { title, source_url: normalizedUrl, source_domain: domain, excerpt, discovery_category: outcome.job.category, discovery_categories: [outcome.job.category], discovery_query: outcome.job.query, discovery_queries: [outcome.job.query], discovery_page: outcome.job.page, discovery_pages: [outcome.job.page], published_at: clean(item.publishedDate, 80) || null, search_engine: "searxng" };
      const key = `${normalizedUrl}|${normalizeTitle(title)}`;
      const previous = unique.get(key);
      if (!previous) { unique.set(key, normalized); continue; }
      const preferred = excerpt.length > String(previous.excerpt ?? "").length ? normalized : previous;
      const fallback = preferred === normalized ? previous : normalized;
      unique.set(key, { ...fallback, ...preferred, excerpt: preferred.excerpt || fallback.excerpt || "", discovery_category: String(preferred.discovery_category || fallback.discovery_category), discovery_categories: [...new Set([...(previous.discovery_categories || []), outcome.job.category])], discovery_queries: [...new Set([...(previous.discovery_queries || []), outcome.job.query])], discovery_pages: [...new Set([...(previous.discovery_pages || []), outcome.job.page])] });
    }
  }
  const results = [...unique.values()].map((item) => {
    const match = calculateRelevance(item.title, item.excerpt || "", item.source_domain, state, graduationYear);
    return { id: randomUUID(), title: item.title, provider: null, award_text: null, deadline: null, deadline_text: null, deadline_timezone: null, deadline_not_published: false, last_checked_date: null, source_authority: "unverified-lead", source_evidence_url: null, source_url: item.source_url, discovery_source_url: null, discovery_category: item.discovery_category, discovery_categories: item.discovery_categories, discovery_queries: item.discovery_queries, discovery_pages: item.discovery_pages, source_domain: item.source_domain, excerpt: item.excerpt, published_at: item.published_at, search_engine: "searxng", relevance_score: match.score, relevance_reasons: match.reasons, verification_state: "unverified_lead", discovered_at: discoveredAt, source_checked_at: null, extracted_rules: { short_source_summary: item.excerpt, uncertainties: ["Sponsor identity, award amount, deadline, and eligibility rules have not been confirmed on the official sponsor page.", "Search ranking is a relevance aid, not an eligibility decision."] } };
  }).sort((a, b) => Number(b.relevance_score) - Number(a.relevance_score) || String(a.title).localeCompare(String(b.title))).slice(0, MAX_RESULTS);
  return { results, rawResultCount };
}
async function readRequestBody(req) {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("body-too-large");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally { reader.releaseLock(); }
}
export function createScholarshipDiscoveryHandler(deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const getEnv = deps.getEnv ?? ((key) => Deno.env.get(key));
  const corsHeaders = deps.corsHeaders ?? {};
  const rateLimiter = deps.rateLimiter ?? createPublicRateLimiter();  const cache = deps.cache ?? createDiscoveryResultCache({ now: () => now().getTime() });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return async (req) => {
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    let rateLimit;
    try { rateLimit = await rateLimiter(req); }
    catch { rateLimit = { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 }; }
    if (rateLimit.storageUnavailable || rateLimit.unattributed) {
      return json({ error: "The shared search rate-limit service is unavailable. Try again shortly." }, 503);
    }
    if (!rateLimit.allowed) {
      const response = json({ error: "Live search is temporarily rate-limited. Wait before trying again." }, 429);
      response.headers.set("Retry-After", String(Math.max(1, rateLimit.retryAfterSeconds || 1)));
      return response;
    }
    const gatewayUrl = getEnv("SEARXNG_GATEWAY_URL")?.trim() ?? "";
    const gatewayToken = getEnv("SEARXNG_GATEWAY_TOKEN") ?? "";
    if (!gatewayUrl || gatewayToken.length < 48) return json({ error: "The laptop search gateway is not configured in Supabase yet." }, 503);
    let gatewayBase;
    try {
      gatewayBase = new URL(gatewayUrl);
      if (!isSafeHttpsUrl(gatewayUrl) || gatewayBase.search || gatewayBase.hash) return json({ error: "The laptop search gateway URL is not a valid public HTTPS base URL." }, 503);
    } catch { return json({ error: "The laptop search gateway URL is not configured correctly." }, 503); }
    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) return json({ error: "Send the search filters as JSON." }, 415);
    let rawBody;
    try { rawBody = await readRequestBody(req); }
    catch (error) {
      if (error instanceof RangeError) return json({ error: "Search request is too large." }, 413);
      return json({ error: "Could not read the search request." }, 400);
    }
    let body;
    try { body = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON request." }, 400); }
    const state = normalizeUsState(clean(body?.profile?.state, 60));
    const yearValue = body?.profile?.graduationYear;
    const rawGraduationYear = typeof yearValue === "number" && Number.isFinite(yearValue)
      ? String(yearValue)
      : typeof yearValue === "string" ? yearValue : "";
    const graduationYear = /^\d{4}$/.test(rawGraduationYear) ? Number(rawGraduationYear) : NaN;
    const currentYear = now().getUTCFullYear();
    if (!state) return json({ error: "Choose a valid US state or territory for scholarship search." }, 400);
    if (!Number.isInteger(graduationYear) || graduationYear < currentYear || graduationYear > currentYear + 9) return json({ error: "Enter a valid high-school graduation year." }, 400);
    const rawCategories = Array.isArray(body?.categories) ? body.categories : [];
    const categories = [...new Set(rawCategories.filter((value) => typeof value === "string" && ALLOWED_CATEGORIES.includes(value)))].slice(0, MAX_CATEGORIES);
    if (categories.length === 0) return json({ error: "Choose at least one scholarship search category." }, 400);

    const cacheKey = `${gatewayBase.href}|${state.toLowerCase()}|${graduationYear}|${[...categories].sort().join(",")}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const cachedPayload = cached.value;
      return json({
        ...cachedPayload,
        summary: {
          requestedQueries: 0,
          successfulQueries: 0,
          failedQueries: 0,
          failureReasons: [],
          pagesChecked: 0,
          rawResultCount: 0,
          uniqueResults: cachedPayload.results.length,
          potentialQueries: cachedPayload.summary.potentialQueries,
          queriesAvoided: cachedPayload.summary.requestedQueries,
          retryAttempts: 0,
          cacheHit: true,
          cacheAgeMs: cached.ageMs,
        },
      });
    }

    const jobs = buildSearchJobs(state, graduationYear, categories);
    const outcomes = await runAdaptiveSearches(gatewayBase, gatewayToken, jobs, { fetchImpl });
    const successfulQueries = outcomes.filter((outcome) => outcome.ok).length;
    const failedQueries = outcomes.length - successfulQueries;
    const retryAttempts = outcomes.reduce((total, outcome) => total + (outcome.retryAttempts || 0), 0);
    const queriesAvoided = Math.max(0, jobs.length - outcomes.length);
    const failureReasonCounts = new Map();
    for (const outcome of outcomes) {
      if (outcome.ok) continue;
      const code = Number.isInteger(outcome.status) ? `http_${outcome.status}` : outcome.failureCode || "network_error";
      failureReasonCounts.set(code, (failureReasonCounts.get(code) || 0) + 1);
    }
    const failureReasons = [...failureReasonCounts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, count]) => ({ code, count }));
    if (failedQueries > 0) {
      console.warn("[scholarship-discover] upstream search failures", {
        requestedQueries: outcomes.length,
        successfulQueries,
        failedQueries,
        failureReasons,
      });
    }
    if (successfulQueries === 0) {
      return json({
        error: "The search gateway could not complete any category searches. Check the laptop, tunnel, and SearXNG service.",
        summary: {
          requestedQueries: outcomes.length,
          successfulQueries,
          failedQueries,
          failureReasons,
          pagesChecked: 0,
          rawResultCount: 0,
          uniqueResults: 0,
          potentialQueries: jobs.length,
          queriesAvoided,
          retryAttempts,
          cacheHit: false,
          cacheAgeMs: 0,
        },
      }, 502);    }

    const discoveredAt = now().toISOString();
    const { results, rawResultCount } = normalizeAndRankResults(outcomes, discoveredAt, state, graduationYear, { randomUUID });
    const warnings = failedQueries > 0
      ? ["Some category or page searches did not complete; this result set may be incomplete."]
      : [];
    const summary = {
      requestedQueries: outcomes.length,
      successfulQueries,
      failedQueries,
      failureReasons,
      pagesChecked: successfulQueries,
      rawResultCount,
      uniqueResults: results.length,
      potentialQueries: jobs.length,
      queriesAvoided,
      retryAttempts,
      cacheHit: false,
      cacheAgeMs: 0,
    };
    const payload = { results, count: results.length, provider: "searxng", warnings, summary };
    // Never cache incomplete responses: a later request must be able to retry them.
    if (failedQueries === 0) cache.set(cacheKey, payload);
    return json(payload);
  };
}
