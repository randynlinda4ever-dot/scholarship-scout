import { withSupabase } from "npm:@supabase/server";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

// Explicit kill switch: sponsor extraction must remain disabled until separately
// reviewed and authorized. The existing project uses public.scholarships with
// owner_id, official_url, sponsor, eligibility, evidence and verification_status.
// This guard performs no database queries, writes, profile reads, or provider calls.
const LIVE_VERIFICATION_ENABLED = false;
const EXISTING_SCHEMA_TABLES = [
  "student_profiles",
  "scholarship_sources",
  "scholarships",
  "eligibility_checks",
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const handler = withSupabase({ auth: "user" }, async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!LIVE_VERIFICATION_ENABLED) {
    return json({
      error: "Sponsor verification is disabled pending schema and privacy review.",
      enabled: false,
      compatibleSchema: EXISTING_SCHEMA_TABLES,
    }, 503);
  }
  return json({ error: "Sponsor verification is not implemented." }, 503);
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const response = await handler(req);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
