import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";
import { createScholarshipDiscoveryHandler } from "../_shared/scholarship-discovery.mjs";
import { createUpstashRateLimiter, getDiscoveryRateLimitConfig } from "../_shared/discovery-rate-limit.mjs";

const getEnv = (key: string) => Deno.env.get(key);
const rateLimitConfig = getDiscoveryRateLimitConfig(getEnv);
const rateLimiter = createUpstashRateLimiter({
  url: getEnv("UPSTASH_REDIS_REST_URL"),
  token: getEnv("UPSTASH_REDIS_REST_TOKEN"),
  config: rateLimitConfig,
});
const discoveryCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": [
    corsHeaders["Access-Control-Allow-Headers"] ?? "",
    "x-scout-client-id",
  ].filter(Boolean).join(", "),
};

const handler = createScholarshipDiscoveryHandler({
  corsHeaders: discoveryCorsHeaders,
  getEnv,
  rateLimiter,
  searchConcurrency: rateLimitConfig.upstreamConcurrency,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: discoveryCorsHeaders });
  const response = await handler(req);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(discoveryCorsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
