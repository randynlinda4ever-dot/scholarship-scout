import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { readBoundedJsonBody } from "../_shared/bounded-json-body.mjs";

const ALLOWED_ORIGINS = new Set([
  "https://scholarship-scout.org",
  "https://www.scholarship-scout.org",
  "https://crimson-surf-7042.preview.animaapp.io",
  "https://view.animaapp.com",
  "https://dev.animaapp.com",
  "http://localhost:5173",
]);

function responseHeaders(origin: string | null): HeadersInit {
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function jsonResponse(
  origin: string | null,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function readNamedKey(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed.default === "string" && parsed.default.trim()
      ? parsed.default.trim()
      : null;
  } catch {
    return null;
  }
}

function getPublishableKey(): string | null {
  return readNamedKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) ??
    Deno.env.get("SUPABASE_ANON_KEY")?.trim() ??
    null;
}

function getServerSecretKey(): string | null {
  // Keep the same server-only key resolution used by the deployed function.
  // Modern secret keys are read from the platform's named-key environment map;
  // no secret key is ever sent to the browser.
  return readNamedKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ??
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ??
    null;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse(origin, 403, { error: "Request origin is not allowed." });
    }
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }

  if (request.method !== "POST") {
    return jsonResponse(origin, 405, { error: "This request method is not supported." });
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(origin, 403, { error: "Request origin is not allowed." });
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const tokenMatch = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!tokenMatch) {
    return jsonResponse(origin, 401, { error: "Sign in again before deleting your account." });
  }

  let body: unknown;
  try {
    body = await readBoundedJsonBody(request, 2048);
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonResponse(origin, 413, { error: "The confirmation request is too large." });
    }
    return jsonResponse(origin, 400, { error: "A valid confirmation is required." });
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      (body as Record<string, unknown>).confirmation !== "DELETE_MY_ACCOUNT") {
    return jsonResponse(origin, 400, { error: "The account-deletion confirmation did not match." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const publishableKey = getPublishableKey();
  const serverSecretKey = getServerSecretKey();
  if (!supabaseUrl || !publishableKey || !serverSecretKey) {
    return jsonResponse(origin, 503, { error: "Account deletion is temporarily unavailable. Contact privacy support." });
  }

  const token = tokenMatch[1];
  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser(token);
  if (userError || !user) {
    return jsonResponse(origin, 401, { error: "Your sign-in session could not be verified. Sign in again and retry." });
  }

  const adminClient = createClient(supabaseUrl, serverSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Revoke every refresh-token session before deleting the account. Supabase
  // access-token JWTs already issued to devices can remain valid until their
  // expiry, but they cannot be refreshed after this global revocation.
  try {
    const { error: revocationError } = await adminClient.auth.admin.signOut(token, "global");
    if (revocationError) {
      return jsonResponse(origin, 500, { error: "Your account sessions could not be revoked, so the account was not deleted. Sign in again and retry." });
    }
  } catch {
    return jsonResponse(origin, 502, { error: "Your account sessions could not be revoked, so the account was not deleted. Retry or contact privacy support." });
  }

  // The account id is obtained only from the verified session. The browser
  // cannot choose another user's id or request deletion of another account.
  let deletionFailed = false;
  try {
    const { error: deletionError } = await adminClient.auth.admin.deleteUser(user.id);
    deletionFailed = Boolean(deletionError);
  } catch {
    deletionFailed = true;
  }
  if (deletionFailed) {
    return jsonResponse(origin, 500, { error: "Account deletion could not be completed. Your sessions were revoked; sign in again before retrying or contact privacy support." });
  }

  // The verified live schema cascades deletion to all current account-owned
  // cloud records. Do not accept table names, record ids, SQL, or filters from
  // the browser. Add Storage-object cleanup before introducing user uploads.
  return jsonResponse(origin, 200, { success: true });
});
