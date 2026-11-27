import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";
import { createPublicRateLimiter } from "../_shared/discovery-rate-limit.mjs";
import { createScholarshipDiscoveryHandler } from "../_shared/scholarship-discovery.mjs";

const getEnv = (key: string) => Deno.env.get(key);
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
  rateLimiter: createPublicRateLimiter(),
  searchConcurrency: 4,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: discoveryCorsHeaders });
  const response = await handler(req);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(discoveryCorsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
