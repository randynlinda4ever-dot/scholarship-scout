const MINUTE_MS = 60_000;
const PUBLIC_RATE_LIMIT_MAX_REQUESTS = 2;
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_CONFIG = Object.freeze({
  clientPerMinute: 4,
  clientPerDay: 20,
  ipPerMinute: 30,
  ipPerDay: 300,
  maxConcurrentPerIp: 2,
  maxConcurrentGlobal: 12,
  leaseMs: 35_000,
  upstreamConcurrency: 4,
});

const CONFIG_SPECS = Object.freeze({
  DISCOVERY_LIMIT_CLIENT_PER_MINUTE: { field: "clientPerMinute", min: 1, max: 60 },
  DISCOVERY_LIMIT_CLIENT_PER_DAY: { field: "clientPerDay", min: 1, max: 500 },
  DISCOVERY_LIMIT_IP_PER_MINUTE: { field: "ipPerMinute", min: 1, max: 600 },
  DISCOVERY_LIMIT_IP_PER_DAY: { field: "ipPerDay", min: 1, max: 5_000 },
  DISCOVERY_LIMIT_IP_CONCURRENT: { field: "maxConcurrentPerIp", min: 1, max: 20 },
  DISCOVERY_LIMIT_GLOBAL_CONCURRENT: { field: "maxConcurrentGlobal", min: 1, max: 100 },
  DISCOVERY_LIMIT_LEASE_MS: { field: "leaseMs", min: 10_000, max: 120_000 },
  DISCOVERY_UPSTREAM_CONCURRENCY: { field: "upstreamConcurrency", min: 1, max: 8 },
});

function readBoundedInteger(getEnv, key, fallback, minimum, maximum) {
  let raw;
  try { raw = getEnv(key); } catch { raw = undefined; }
  const value = String(raw ?? "").trim();
  if (!/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function getDiscoveryRateLimitConfig(getEnv = (key) => globalThis.Deno?.env?.get?.(key)) {
  const config = { ...DEFAULT_CONFIG };
  for (const [key, spec] of Object.entries(CONFIG_SPECS)) {
    config[spec.field] = readBoundedInteger(getEnv, key, DEFAULT_CONFIG[spec.field], spec.min, spec.max);
  }
  return config;
}

export function getPublicClientAddress(req) {
  // Cloudflare overwrites cf-connecting-ip at its edge. Never trust x-real-ip.
  const address = req.headers.get("cf-connecting-ip")?.trim() ?? "";
  if (!address || address.length > 128 || !/^[a-f0-9:.]+$/i.test(address)) return null;
  return address.toLowerCase();
}

export function createPublicRateLimiter({ now = () => Date.now(), maxBuckets = 5_000 } = {}) {
  const buckets = new Map();
  return (req) => {
    const address = getPublicClientAddress(req);
    if (!address) return { allowed: false, unattributed: true, retryAfterSeconds: 0 };
    const current = now();
    let bucket = buckets.get(address);
    if (bucket && current - bucket.windowStartedAt >= MINUTE_MS) {
      buckets.delete(address);
      bucket = null;
    }
    if (!bucket) {
      if (buckets.size >= maxBuckets) {
        for (const [key, entry] of buckets) {
          if (current - entry.windowStartedAt >= MINUTE_MS) buckets.delete(key);
          if (buckets.size < maxBuckets) break;
        }
      }
      if (buckets.size >= maxBuckets) return { allowed: false, retryAfterSeconds: 1 };
      bucket = { windowStartedAt: current, count: 0 };
      buckets.set(address, bucket);
    }
    if (bucket.count >= PUBLIC_RATE_LIMIT_MAX_REQUESTS) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((MINUTE_MS - (current - bucket.windowStartedAt)) / 1_000)),
      };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

const ADMISSION_SCRIPT = [
  "local function check_quota(key, limit, reason)",
  "  local count = tonumber(redis.call('GET', key) or '0')",
  "  if count >= limit then",
  "    local remaining = redis.call('PTTL', key)",
  "    return {0, math.max(1, math.ceil(remaining / 1000)), reason}",
  "  end",
  "  return nil",
  "end",
  "local blocked = check_quota(KEYS[1], tonumber(ARGV[1]), 'client_minute')",
  "if blocked then return blocked end",
  "blocked = check_quota(KEYS[2], tonumber(ARGV[2]), 'client_day')",
  "if blocked then return blocked end",
  "blocked = check_quota(KEYS[3], tonumber(ARGV[3]), 'ip_minute')",
  "if blocked then return blocked end",
  "blocked = check_quota(KEYS[4], tonumber(ARGV[4]), 'ip_day')",
  "if blocked then return blocked end",
  "local redis_time = redis.call('TIME')",
  "local now = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)",
  "local lease_ms = tonumber(ARGV[7])",
  "local lease_id = ARGV[8]",
  "redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', now)",
  "redis.call('ZREMRANGEBYSCORE', KEYS[6], '-inf', now)",
  "local ip_active = redis.call('ZCARD', KEYS[5])",
  "local global_active = redis.call('ZCARD', KEYS[6])",
  "local function retry_after(key)",
  "  local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')",
  "  if #first >= 2 then return math.max(1, math.ceil((tonumber(first[2]) - now) / 1000)) end",
  "  return 1",
  "end",
  "if ip_active >= tonumber(ARGV[5]) then return {0, retry_after(KEYS[5]), 'ip_concurrency'} end",
  "if global_active >= tonumber(ARGV[6]) then return {0, retry_after(KEYS[6]), 'global_concurrency'} end",
  "local function increment_quota(key, ttl)",
  "  local count = redis.call('INCR', key)",
  "  if count == 1 then redis.call('PEXPIRE', key, ttl) end",
  "end",
  "increment_quota(KEYS[1], 60000)",
  "increment_quota(KEYS[2], 86400000)",
  "increment_quota(KEYS[3], 60000)",
  "increment_quota(KEYS[4], 86400000)",
  "local expires_at = now + lease_ms",
  "redis.call('ZADD', KEYS[5], expires_at, lease_id)",
  "redis.call('ZADD', KEYS[6], expires_at, lease_id)",
  "redis.call('PEXPIRE', KEYS[5], lease_ms * 2)",
  "redis.call('PEXPIRE', KEYS[6], lease_ms * 2)",
  "return {1, 0, 'allowed'}",
].join("\n");

const RELEASE_SCRIPT = [
  "redis.call('ZREM', KEYS[1], ARGV[1])",
  "redis.call('ZREM', KEYS[2], ARGV[1])",
  "return 1",
].join("\n");

function normalizeConfig(config) {
  const source = config && typeof config === "object" ? config : DEFAULT_CONFIG;
  const normalized = {};
  for (const spec of Object.values(CONFIG_SPECS)) {
    const value = Number(source[spec.field]);
    normalized[spec.field] = Number.isSafeInteger(value)
      ? Math.max(spec.min, Math.min(spec.max, value))
      : DEFAULT_CONFIG[spec.field];
  }
  return normalized;
}

export function createUpstashRateLimiter({
  url,
  token,
  config = getDiscoveryRateLimitConfig(() => undefined),
  fetchImpl = fetch,
  randomUUID = () => globalThis.crypto?.randomUUID?.(),
} = {}) {
  const endpoint = String(url ?? "").trim();
  const secret = String(token ?? "").trim();
  let endpointUrl = "";
  try {
    const parsed = new URL(endpoint);
    if (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      !parsed.search &&
      !parsed.hash &&
      parsed.pathname === "/"
    ) endpointUrl = parsed.href;
  } catch { /* invalid endpoint is handled as unavailable below */ }
  const limits = normalizeConfig(config);
  let hmacKeyPromise;

  const getHmacKey = () => {
    if (!hmacKeyPromise) {
      hmacKeyPromise = globalThis.crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    }
    return hmacKeyPromise;
  };

  const hashIdentifier = async (purpose, value) => {
    const key = await getHmacKey();
    const signature = await globalThis.crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(purpose + ":" + value),
    );
    return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  const postCommand = async (command) => fetchImpl(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + secret,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(2_500),
    redirect: "error",
  });

  return async (req) => {
    if (!endpointUrl || secret.length < 32) {
      return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
    }
    const address = getPublicClientAddress(req);
    if (!address) return { allowed: false, unattributed: true, retryAfterSeconds: 0 };

    try {
      const suppliedClientId = req.headers.get("x-scout-client-id")?.trim() ?? "";
      const clientId = CLIENT_ID_PATTERN.test(suppliedClientId) ? suppliedClientId.toLowerCase() : "ip-fallback:" + address;
      const [clientDigest, ipDigest] = await Promise.all([
        hashIdentifier("client", clientId),
        hashIdentifier("ip", address),
      ]);
      const leaseId = String(randomUUID?.() ?? "").trim().slice(0, 128);
      if (!leaseId) {
        return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
      }
      const prefix = "scholarship-discover:rate:v2:";
      const keys = [
        prefix + "client-minute:" + clientDigest,
        prefix + "client-day:" + clientDigest,
        prefix + "ip-minute:" + ipDigest,
        prefix + "ip-day:" + ipDigest,
        prefix + "ip-concurrency:" + ipDigest,
        prefix + "global-concurrency",
      ];
      const response = await postCommand([
        "EVAL",
        ADMISSION_SCRIPT,
        "6",
        ...keys,
        String(limits.clientPerMinute),
        String(limits.clientPerDay),
        String(limits.ipPerMinute),
        String(limits.ipPerDay),
        String(limits.maxConcurrentPerIp),
        String(limits.maxConcurrentGlobal),
        String(limits.leaseMs),
        leaseId,
      ]);
      if (!response.ok) return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
      const payload = await response.json();
      const result = payload?.result;
      if (!Array.isArray(result) || result.length < 3) {
        return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
      }
      const allowed = Number(result[0]) === 1;
      const retryAfterSeconds = Math.max(0, Math.ceil(Number(result[1]) || 0));
      const reason = typeof result[2] === "string" ? result[2] : "unknown";
      if (!allowed) {
        return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds), reason };
      }

      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        try {
          const releaseResponse = await postCommand([
            "EVAL",
            RELEASE_SCRIPT,
            "2",
            keys[4],
            keys[5],
            leaseId,
          ]);
          if (releaseResponse.ok) await releaseResponse.json().catch(() => null);
        } catch { /* the lease expires automatically if release cannot reach Redis */ }
      };
      return { allowed: true, retryAfterSeconds: 0, reason, release };
    } catch {
      return { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
    }
  };
}
