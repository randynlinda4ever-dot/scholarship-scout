import { canonicalizeUrl, isSafeHttpsUrl, normalizeTitle } from "./scholarship-discovery.mjs";

export const SEARCH_STATUSES = Object.freeze([
  "success", "partial", "empty", "rate_limited", "unavailable", "timeout", "cancelled", "error",
]);

const RETRYABLE_STATUSES = new Set(["partial", "empty", "rate_limited", "unavailable", "timeout"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const clockValue = (now) => { const value = now(); return value instanceof Date ? value.getTime() : Number(value); };
const isoAt = (milliseconds) => new Date(milliseconds).toISOString();
const clean = (value, maxLength) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
const dateValue = (value) => {
  if (value == null || value === "") return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? isoAt(parsed) : null;
};
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createSearchProvider(name, search) {
  const providerName = clean(name, 80);
  if (!providerName) throw new TypeError("A non-empty provider name is required.");
  if (typeof search !== "function") throw new TypeError("A provider search function is required.");
  return Object.freeze({ name: providerName, search });
}

export function createSearchResponseCache({ now = () => Date.now(), ttlMs = 30_000, maxEntries = 100 } = {}) {
  const entries = new Map();
  const prune = () => {
    const current = clockValue(now);
    for (const [key, entry] of entries) {
      if (!Number.isFinite(current - entry.createdAt) || current - entry.createdAt >= ttlMs) entries.delete(key);
    }
  };
  return {
    get size() { prune(); return entries.size; },
    get(key) {
      prune();
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      entries.set(key, entry);
      return { value: clone(entry.value), ageMs: Math.max(0, clockValue(now) - entry.createdAt) };
    },
    set(key, value) {
      if (typeof key !== "string" || !key || ttlMs <= 0 || maxEntries <= 0) return false;
      prune();
      if (entries.has(key)) entries.delete(key);
      while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(key, { createdAt: clockValue(now), value: clone(value) });
      return true;
    },
    clear() { entries.clear(); },
  };
}

function assessFreshness(publishedAt, updatedAt, maxAgeDays, asOfMs) {
  const date = updatedAt || publishedAt;
  if (!date) return "unknown";
  if (!Number.isFinite(maxAgeDays)) return "dated";
  const ageMs = asOfMs - Date.parse(date);
  if (!Number.isFinite(ageMs)) return "unknown";
  if (ageMs < 0) return "future";
  return ageMs <= maxAgeDays * DAY_MS ? "fresh" : "stale";
}

function normalizeProviderResult(raw, providerName, requestId, retrievedAt, request) {
  const title = clean(raw?.title, 220);
  const originalUrl = clean(raw?.url ?? raw?.link, 2048);
  if (!title || !isSafeHttpsUrl(originalUrl)) return null;
  let url;
  try { url = canonicalizeUrl(originalUrl); } catch { return null; }
  const publishedAt = dateValue(raw?.publishedAt ?? raw?.publishedDate ?? raw?.published_date ?? raw?.age);
  const updatedAt = dateValue(raw?.updatedAt ?? raw?.updatedDate ?? raw?.updated_date);
  const asOf = request.asOf ? Date.parse(request.asOf) : Date.parse(retrievedAt);
  return {
    title,
    url,
    snippet: clean(raw?.snippet ?? raw?.content ?? raw?.description, 1800),
    provenance: [{
      provider: providerName,
      providerRequestId: requestId,
      retrievedAt,
      publishedAt,
      updatedAt,
      canonicalUrl: url,
      originalUrl,
      contentHash: clean(raw?.contentHash ?? raw?.content_hash, 128) || null,
      freshness: assessFreshness(publishedAt, updatedAt, request.maxAgeDays, asOf),
    }],
  };
}

function normalizeProviderResponse(provider, raw, request, retrievedAt) {
  if (!raw || typeof raw !== "object" || !SEARCH_STATUSES.includes(raw.status) || !Array.isArray(raw.results)) {
    return { status: "error", results: [], error: { code: "INVALID_PROVIDER_RESPONSE", retryable: false } };
  }
  const providerRequestId = clean(raw.providerRequestId ?? raw.requestId, 120) || null;
  const results = raw.results.map((item) => normalizeProviderResult(item, provider.name, providerRequestId, retrievedAt, request)).filter(Boolean);
  const status = raw.status === "success" && results.length === 0 ? "empty" : raw.status;
  const retryable = typeof raw.error?.retryable === "boolean" ? raw.error.retryable : RETRYABLE_STATUSES.has(status);
  const code = clean(raw.error?.code, 80) || null;
  return { status, results, error: code ? { code, retryable } : (status === "error" ? { code: "PROVIDER_ERROR", retryable } : null) };
}

function mergeResults(target, incoming) {
  const merged = new Map(target.map((item) => [item.url + "|" + normalizeTitle(item.title), item]));
  for (const item of incoming) {
    const key = item.url + "|" + normalizeTitle(item.title);
    const previous = merged.get(key);
    if (!previous) { merged.set(key, item); continue; }
    const provenance = [...previous.provenance];
    for (const source of item.provenance) {
      if (!provenance.some((entry) => entry.provider === source.provider && entry.canonicalUrl === source.canonicalUrl)) provenance.push(source);
    }
    merged.set(key, { ...previous, snippet: item.snippet.length > previous.snippet.length ? item.snippet : previous.snippet, provenance });
  }
  return [...merged.values()];
}

async function callProvider(provider, request, timeoutMs) {
  if (request.signal?.aborted) return { status: "cancelled", results: [], error: { code: "CANCELLED", retryable: false } };
  const controller = new AbortController();
  let callerCancelled = false;
  const onCallerAbort = () => { callerCancelled = true; controller.abort(request.signal?.reason); };
  request.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(() => controller.abort("provider-timeout"), Math.max(1, timeoutMs));
  const aborted = new Promise((resolve) => {
    controller.signal.addEventListener("abort", () => resolve({ kind: "aborted" }), { once: true });
  });
  const pending = Promise.resolve()
    .then(() => provider.search({ ...request, signal: controller.signal }))
    .then((value) => ({ kind: "value", value }), () => ({ kind: "error" }));
  try {
    const outcome = await Promise.race([pending, aborted]);
    if (outcome.kind === "aborted") {
      return callerCancelled
        ? { status: "cancelled", results: [], error: { code: "CANCELLED", retryable: false } }
        : { status: "timeout", results: [], error: { code: "PROVIDER_TIMEOUT", retryable: true } };
    }
    if (outcome.kind === "error") return { status: "unavailable", results: [], error: { code: "PROVIDER_UNAVAILABLE", retryable: true } };
    return outcome.value;
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onCallerAbort);
    if (!controller.signal.aborted) controller.abort();
  }
}

export async function searchWithFallback({
  providers, request, cache = null, now = () => new Date(),
  maxProvidersToTry = providers?.length ?? 0, minResults = 5,
  providerTimeoutMs = 4_000, totalTimeoutMs = 12_000, cacheVersion = "1",
} = {}) {
  if (!Array.isArray(providers) || providers.length === 0 || providers.some((provider) => !provider?.name || typeof provider.search !== "function")) {
    throw new TypeError("At least one valid search provider is required.");
  }
  const query = clean(request?.query, 500);
  if (!query) throw new TypeError("A non-empty search query is required.");
  const limit = Math.max(1, Math.min(50, Math.floor(Number(request?.limit) || 10)));
  const maxAgeDays = request?.maxAgeDays != null && Number.isFinite(Number(request.maxAgeDays)) ? Math.max(0, Number(request.maxAgeDays)) : null;
  let asOf = null;
  if (request?.asOf) {
    const parsedAsOf = Date.parse(request.asOf);
    if (!Number.isFinite(parsedAsOf)) throw new TypeError("The search request asOf date is invalid.");
    asOf = isoAt(parsedAsOf);
  }
  const normalizedRequest = { query, limit, maxAgeDays, asOf, signal: request?.signal };
  const currentTime = () => clockValue(now);
  const startedAtMs = currentTime();
  const startedAt = isoAt(startedAtMs);
  const providerLimit = Math.max(1, Math.min(providers.length, Math.floor(Number(maxProvidersToTry) || providers.length)));
  const requiredResults = Math.max(1, Math.min(50, Math.floor(Number(minResults) || 5)));
  const cacheKey = JSON.stringify({
    cacheVersion, query: query.toLowerCase(), limit, maxAgeDays, asOf,
    providers: providers.slice(0, providerLimit).map((provider) => provider.name),
  });

  if (normalizedRequest.signal?.aborted) {
    return { status: "cancelled", provider: null, results: [], attempts: [], startedAt, completedAt: isoAt(currentTime()), durationMs: 0, cache: { hit: false, ageMs: 0 }, error: { code: "CANCELLED", retryable: false } };
  }
  const cached = cache?.get(cacheKey);
  if (cached) return { ...cached.value, cache: { hit: true, ageMs: cached.ageMs } };

  const attempts = [];
  let results = [];
  let lastFailure = null;
  let completedSuccessfully = false;
  let cancelled = false;
  for (const provider of providers.slice(0, providerLimit)) {
    if (normalizedRequest.signal?.aborted) { cancelled = true; break; }
    const remaining = totalTimeoutMs - (currentTime() - startedAtMs);
    if (remaining <= 0) {
      lastFailure = { status: "timeout", error: { code: "TOTAL_TIMEOUT", retryable: true } };
      break;
    }
    const callStarted = currentTime();
    const raw = await callProvider(provider, normalizedRequest, Math.min(providerTimeoutMs, remaining));
    const retrievedAt = isoAt(currentTime());
    const normalized = normalizeProviderResponse(provider, raw, normalizedRequest, retrievedAt);
    attempts.push({
      provider: provider.name, status: normalized.status,
      durationMs: Math.max(0, currentTime() - callStarted),
      resultCount: normalized.results.length,
      error: normalized.error ? { code: normalized.error.code, retryable: normalized.error.retryable } : null,
    });
    results = mergeResults(results, normalized.results);
    if (normalized.status === "cancelled") { cancelled = true; break; }
    if (normalized.status === "error" && normalized.error?.retryable === false) { lastFailure = normalized; break; }
    if (normalized.status === "success" && results.length >= requiredResults) { completedSuccessfully = true; break; }
    if (normalized.status !== "success" && normalized.status !== "partial" && normalized.status !== "empty") lastFailure = normalized;
    else if (normalized.status === "partial") lastFailure = normalized;
  }

  const completedAt = isoAt(currentTime());
  const durationMs = Math.max(0, currentTime() - startedAtMs);
  let status;
  if (cancelled || normalizedRequest.signal?.aborted) status = "cancelled";
  else if (completedSuccessfully) status = "success";
  else if (results.length > 0) status = "partial";
  else if (attempts.length > 0 && attempts.every((attempt) => attempt.status === "empty")) status = "empty";
  else status = lastFailure?.status || attempts.at(-1)?.status || "unavailable";

  const providerNames = [...new Set(attempts.filter((attempt) => attempt.resultCount > 0).map((attempt) => attempt.provider))];
  const response = {
    status,
    provider: providerNames.length > 1 ? "multiple" : (providerNames[0] || attempts.at(-1)?.provider || null),
    results, attempts, startedAt, completedAt, durationMs,
    cache: { hit: false, ageMs: 0 },
    error: ["success", "partial", "empty", "cancelled"].includes(status)
      ? null
      : (lastFailure?.error || { code: status.toUpperCase(), retryable: RETRYABLE_STATUSES.has(status) }),
  };
  if (status === "success") cache?.set(cacheKey, response);
  return response;
}
