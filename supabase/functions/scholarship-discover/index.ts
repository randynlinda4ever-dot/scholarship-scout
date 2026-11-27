import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";
import { createScholarshipDiscoveryHandler, createUpstashRateLimiter } from "../_shared/scholarship-discovery.mjs";

const handler = createScholarshipDiscoveryHandler({
  corsHeaders,
  rateLimiter: createUpstashRateLimiter({
    url: Deno.env.get("UPSTASH_REDIS_REST_URL"),
    token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN"),
  }),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const response = await handler(req);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
