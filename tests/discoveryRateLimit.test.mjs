import test from "node:test";
import assert from "node:assert/strict";
import {
  createUpstashRateLimiter,
  getDiscoveryRateLimitConfig,
} from "../supabase/functions/_shared/discovery-rate-limit.mjs";

const REDIS_TOKEN = "synthetic-upstash-rest-token-abcdefghijklmnopqrstuvwxyz0123456789";
const makeRequest = ({ ip = "192.0.2.10", clientId = "a3f5f0b0-2f1b-4a3b-9a0c-7d8e9f001122" } = {}) =>
  new Request("https://edge.example/discover", {
    method: "POST",
    headers: {
      "cf-connecting-ip": ip,
      ...(clientId ? { "x-scout-client-id": clientId } : {}),
    },
  });
const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

test("rate-limit configuration is server-controlled, validated, and bounded", () => {
  const config = getDiscoveryRateLimitConfig((key) => ({
    DISCOVERY_LIMIT_CLIENT_PER_MINUTE: "6",
    DISCOVERY_LIMIT_CLIENT_PER_DAY: "25",
    DISCOVERY_LIMIT_IP_PER_MINUTE: "45",
    DISCOVERY_LIMIT_IP_PER_DAY: "400",
    DISCOVERY_LIMIT_IP_CONCURRENT: "3",
    DISCOVERY_LIMIT_GLOBAL_CONCURRENT: "16",
    DISCOVERY_LIMIT_LEASE_MS: "45000",
    DISCOVERY_UPSTREAM_CONCURRENCY: "5",
  }[key]));
  assert.deepEqual(config, {
    clientPerMinute: 6,
    clientPerDay: 25,
    ipPerMinute: 45,
    ipPerDay: 400,
    maxConcurrentPerIp: 3,
    maxConcurrentGlobal: 16,
    leaseMs: 45_000,
    upstreamConcurrency: 5,
  });
  const defaults = getDiscoveryRateLimitConfig(() => "not-a-number");
  assert.deepEqual(defaults, {
    clientPerMinute: 4,
    clientPerDay: 20,
    ipPerMinute: 30,
    ipPerDay: 300,
    maxConcurrentPerIp: 2,
    maxConcurrentGlobal: 12,
    leaseMs: 35_000,
    upstreamConcurrency: 4,
  });
});

test("separate browser clients on one shared IP have separate client keys and shared IP keys", async () => {
  const commands = [];
  const limiter = createUpstashRateLimiter({
    url: "https://redis.example.upstash.io",
    token: REDIS_TOKEN,
    randomUUID: () => "lease-1",
    fetchImpl: async (_url, init) => {
      commands.push(JSON.parse(init.body));
      return jsonResponse({ result: [1, 0, "allowed"] });
    },
  });

  const first = await limiter(makeRequest({ clientId: "a3f5f0b0-2f1b-4a3b-9a0c-7d8e9f001122" }));
  const second = await limiter(makeRequest({ clientId: "b3f5f0b0-2f1b-4a3b-9a0c-7d8e9f001122" }));

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(commands.length, 2);
  const firstKeys = commands[0].slice(3, 9);
  const secondKeys = commands[1].slice(3, 9);
  assert.notEqual(firstKeys[0], secondKeys[0], "browser-specific minute buckets must differ");
  assert.notEqual(firstKeys[1], secondKeys[1], "browser-specific daily buckets must differ");
  assert.equal(firstKeys[2], secondKeys[2], "both browsers share the IP minute ceiling");
  assert.equal(firstKeys[3], secondKeys[3], "both browsers share the IP daily ceiling");
  assert.equal(firstKeys[4], secondKeys[4], "both browsers share the per-IP concurrency pool");
  assert.equal(firstKeys[5], secondKeys[5], "all clients share the global concurrency pool");
  assert.ok(commands.every((command) => !JSON.stringify(command).includes("192.0.2.10")));
  assert.ok(commands.every((command) => !JSON.stringify(command).includes("a3f5f0b0-2f1b-4a3b-9a0c-7d8e9f001122")));
});

test("shared limiter executes atomic quota and lease acquisition, then releases both leases", async () => {
  const commands = [];
  const limiter = createUpstashRateLimiter({
    url: "https://redis.example.upstash.io",
    token: REDIS_TOKEN,
    randomUUID: () => "lease-unique-1",
    fetchImpl: async (_url, init) => {
      const command = JSON.parse(init.body);
      commands.push(command);
      return command[1].includes("ZADD")
        ? jsonResponse({ result: [1, 0, "allowed"] })
        : jsonResponse({ result: 1 });
    },
  });

  const decision = await limiter(makeRequest());
  assert.equal(decision.allowed, true);
  assert.equal(typeof decision.release, "function");
  assert.equal(commands[0][0], "EVAL");
  assert.equal(commands[0][2], "6");
  assert.match(commands[0][1], /redis\.call\('INCR'/);
  assert.match(commands[0][1], /redis\.call\('ZREMRANGEBYSCORE'/);
  assert.match(commands[0][1], /redis\.call\('ZADD'/);
  assert.match(commands[0][1], /redis\.call\('ZCARD'/);
  assert.match(commands[0][1], /redis\.call\('GET'/);
  assert.match(commands[0][1], /redis\.call\('TIME'/);
  const script = commands[0][1];
  const firstIncrement = script.indexOf("redis.call('INCR'");
  assert.ok(script.indexOf("redis.call('GET'") < firstIncrement, "quota checks must happen before any counter is incremented");
  assert.ok(script.indexOf("redis.call('ZCARD'") < firstIncrement, "concurrency checks must happen before quota counters are consumed");
  assert.equal(commands[0].slice(9).length, 8, "the script receives six limits, lease duration, and a lease id");

  await decision.release();
  await decision.release();

  assert.equal(commands.length, 2, "release is idempotent");
  assert.equal(commands[1][0], "EVAL");
  assert.equal(commands[1][2], "2");
  assert.match(commands[1][1], /redis\.call\('ZREM'/);
  assert.ok(commands[1].includes("lease-unique-1"));
});

test("rate-limit decisions return the shared Redis reason and Retry-After duration", async () => {
  const limiter = createUpstashRateLimiter({
    url: "https://redis.example.upstash.io",
    token: REDIS_TOKEN,
    fetchImpl: async () => jsonResponse({ result: [0, 17, "global_concurrency"] }),
  });

  const decision = await limiter(makeRequest());
  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterSeconds, 17);
  assert.equal(decision.reason, "global_concurrency");
});

test("missing Redis config, untrusted client address, and backend failures fail closed", async () => {
  assert.equal((await createUpstashRateLimiter({})(makeRequest())).storageUnavailable, true);

  const noAddress = new Request("https://edge.example/discover", {
    method: "POST",
    headers: { "x-real-ip": "192.0.2.10" },
  });
  const configured = createUpstashRateLimiter({
    url: "https://redis.example.upstash.io",
    token: REDIS_TOKEN,
    fetchImpl: async () => jsonResponse({ result: [1, 0, "allowed"] }),
  });
  assert.equal((await configured(noAddress)).unattributed, true);

  const unavailable = createUpstashRateLimiter({
    url: "https://redis.example.upstash.io",
    token: REDIS_TOKEN,
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.equal((await unavailable(makeRequest())).storageUnavailable, true);
});

test("invalid Redis URLs are rejected before credentials are sent", async () => {
  let calls = 0;
  const limiter = createUpstashRateLimiter({
    url: "http://redis.example.upstash.io",
    token: REDIS_TOKEN,
    fetchImpl: async () => { calls++; return jsonResponse({ result: [1, 0, "allowed"] }); },
  });
  assert.equal((await limiter(makeRequest())).storageUnavailable, true);
  assert.equal(calls, 0);
});
