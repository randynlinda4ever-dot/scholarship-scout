import { getSupabaseClient } from "./supabaseClient";
import { getMagicLinkRedirectUrl } from "./authRedirect.js";
import { buildCloudScholarshipRow, findExistingCloudScholarshipMatch, mapCloudScholarship } from "./cloudMapping";
import { rankAndDeduplicateLiveResults } from "./discoveryPipeline.js";
import { pickLiveDiscoveryProfile } from "./liveDiscoveryProfile.js";
import { createCloudScholarshipId } from "./cloudRecordId.js";
import { getDiscoveryClientId } from "./discoveryClientIdentity.js";

export type LiveScholarship = {
  id: string;
  title: string;
  provider: string | null;
  award_text: string | null;
  award_evidence_text?: string;
  award_evidence_url?: string | null;
  award_currency_basis?: string;
  award_basis?: string;
  deadline: string | null;
  deadline_text?: string;
  deadline_timezone?: string;
  open_date?: string | null;
  open_date_timezone?: string;
  priority_deadline?: string | null;
  priority_deadline_text?: string;
  priority_deadline_timezone?: string;
  deadline_not_published?: boolean;
  last_checked_date?: string | null;
  source_authority?: string;
  source_evidence_url?: string | null;
  source_url: string;
  discovery_source_url: string | null;
  discovery_category: string;
  excerpt: string;
  verification_state: string;
  discovered_at: string | null;
  record_created_at?: string | null;
  source_domain?: string | null;
  discovery_categories?: string[];
  discovery_queries?: string[];
  discovery_pages?: number[];
  relevance_score?: number;
  relevance_reasons?: string[];
  published_at?: string | null;
  search_engine?: string;
  extracted_rules?: Record<string, unknown>;
  criteriaImportance?: Record<string, "mandatory" | "preferred">;
  source_checked_at?: string | null;
};

export type LiveDiscoverySummary = {
  requestedQueries: number;
  successfulQueries: number;
  failedQueries: number;
  pagesChecked: number;
  rawResultCount: number;
  uniqueResults: number;
  potentialQueries?: number;
  queriesAvoided?: number;
  retryAttempts?: number;
  cacheHit?: boolean;
  cacheAgeMs?: number;
};

export type LiveDiscoveryRun = {
  results: LiveScholarship[];
  summary: LiveDiscoverySummary;
  warnings: string[];
};

const CLOUD_PAGE_SIZE = 500;
const CLOUD_FIELDS = "id,title,sponsor,official_url,award_min,award_max,currency,deadline,eligibility,evidence,verification_status,created_at,updated_at";

async function fetchCloudPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  errorMessage: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += CLOUD_PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + CLOUD_PAGE_SIZE - 1);
    if (error) throw new Error(errorMessage);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < CLOUD_PAGE_SIZE) break;
  }
  return rows;
}

async function requireClient() {
  const client = await getSupabaseClient();
  if (!client) throw new Error("Cloud connection is not configured. Add the existing project's publishable key to the app environment.");
  return client;
}

async function requireUser() {
  const client = await requireClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error("Sign in before saving scholarship records to your cloud account.");
  }
  return { client, user: data.user };
}

export async function sendMagicLink(email: string) {
  const client = await requireClient();
  const emailRedirectTo = getMagicLinkRedirectUrl();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) throw error;
}

export type AccountVaultBackup = {
  credential_id: string;
  prf_salt: string;
  encrypted_envelope: Record<string, unknown>;
  revision: number;
  updated_at: string;
};

async function requireAccountUser() {
  const { client, user } = await requireUser();
  if (user.is_anonymous) {
    throw new Error("A permanent signed-in account is required for cross-device vault recovery.");
  }
  return { client, user };
}

export async function getAccountVaultBackup(): Promise<AccountVaultBackup | null> {
  const { client, user } = await requireAccountUser();
  const { data, error } = await client
    .from("account_vault_backups")
    .select("credential_id,prf_salt,encrypted_envelope,revision,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("The encrypted account vault backup could not be checked.");
  if (!data) return null;
  if (typeof data.credential_id !== "string" ||
      typeof data.prf_salt !== "string" ||
      !data.encrypted_envelope ||
      typeof data.encrypted_envelope !== "object" ||
      !Number.isSafeInteger(data.revision) ||
      data.revision < 1) {
    throw new Error("The encrypted account vault backup metadata is invalid.");
  }
  return data as AccountVaultBackup;
}

export async function createAccountVaultBackup({
  credentialId,
  prfSalt,
  encryptedEnvelope,
}: {
  credentialId: string;
  prfSalt: string;
  encryptedEnvelope: Record<string, unknown>;
}): Promise<AccountVaultBackup> {
  const { client, user } = await requireAccountUser();
  const { data, error } = await client
    .from("account_vault_backups")
    .insert({
      user_id: user.id,
      credential_id: credentialId,
      prf_salt: prfSalt,
      encrypted_envelope: encryptedEnvelope,
      revision: 1,
    })
    .select("credential_id,prf_salt,encrypted_envelope,revision,updated_at")
    .single();
  if (error || !data) {
    throw new Error(error?.code === "23505"
      ? "An account vault backup already exists. Refresh the backup status before trying again."
      : "The encrypted account vault backup could not be created.");
  }
  return data as AccountVaultBackup;
}

export async function updateAccountVaultBackup({
  encryptedEnvelope,
  expectedRevision,
}: {
  encryptedEnvelope: Record<string, unknown>;
  expectedRevision: number;
}): Promise<number> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("The account vault backup revision is invalid.");
  }
  const { client, user } = await requireAccountUser();
  const nextRevision = expectedRevision + 1;
  const { data, error } = await client
    .from("account_vault_backups")
    .update({
      encrypted_envelope: encryptedEnvelope,
      revision: nextRevision,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("revision", expectedRevision)
    .select("revision")
    .maybeSingle();
  if (error) throw new Error("The encrypted account vault backup could not be synchronized.");
  if (!data) {
    throw new Error("A newer vault backup already exists on another device. Refresh before saving again so newer records are not overwritten.");
  }
  return nextRevision;
}

export async function deleteAccountVaultBackup(): Promise<void> {
  const { client, user } = await requireAccountUser();
  const { error } = await client
    .from("account_vault_backups")
    .delete()
    .eq("user_id", user.id);
  if (error) throw new Error("The encrypted account vault backup could not be deleted. Your local vault was not changed.");
}

export async function signInWithGoogle(): Promise<void> {
  const client = await requireClient();
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getMagicLinkRedirectUrl(),
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

/**
 * Convert the current anonymous browser account into a Google-backed account
 * without changing its auth.users id or ownership of existing cloud rows.
 */
export async function linkGoogleIdentity(): Promise<void> {
  const client = await requireClient();
  const { data, error: userError } = await client.auth.getUser();
  if (userError || !data.user?.is_anonymous) {
    throw new Error("Google can only be linked from an active anonymous cloud session.");
  }
  const { error } = await client.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: getMagicLinkRedirectUrl(),
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

export async function getCloudUser() {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function signOutCloudUser() {
  const client = await getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/**
 * Permanently deletes only the currently authenticated account. The server
 * derives the user id from the verified session; no user id is accepted here.
 */
export async function deleteCloudAccount(): Promise<void> {
  const { client } = await requireUser();
  const { data, error } = await client.functions.invoke("account-delete", {
    body: { confirmation: "DELETE_MY_ACCOUNT" },
  });

  if (error || data?.success !== true) {
    throw new Error("Your cloud account could not be deleted. Check your connection and try again, or contact privacy support.");
  }

  // The server has already removed the account. Clear this browser's session
  // independently so the deleted identity is not retained by the client.
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // The local vault cleanup step also removes the stored sign-in session.
  }
}

/**
 * Lists only scholarship opportunity records owned by the signed-in account.
 * Student profile and student-specific eligibility tables are intentionally not read.
 */
export async function listCloudScholarships(): Promise<LiveScholarship[]> {
  const { client, user } = await requireUser();
  const rows = await fetchCloudPages(
    (from, to) => client
      .from("scholarships")
      .select(CLOUD_FIELDS)
      .eq("owner_id", user.id)
      .not("official_url", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
    "Your cloud scholarship records could not be loaded.",
  );
  return rows.map((row) => mapCloudScholarship(row));
}

/**
 * Saves scholarship/sponsor metadata only. It deliberately excludes student profile,
 * contact details, personal notes, and eligibility assessment results.
 */
export async function saveCloudScholarship(item: Record<string, unknown>): Promise<LiveScholarship> {
  const { client, user } = await requireUser();
  const payload = buildCloudScholarshipRow(item, user.id);

  // Paginate the URL-scoped candidates so records beyond PostgREST's default
  // row cap cannot evade duplicate detection.
  const candidates = await fetchCloudPages(
    (from, to) => client
      .from("scholarships")
      .select("id,title,sponsor,deadline")
      .eq("owner_id", user.id)
      .eq("official_url", payload.official_url)
      .order("id", { ascending: true })
      .range(from, to),
    "Could not check for an existing cloud scholarship record.",
  );

  const existing = findExistingCloudScholarshipMatch(candidates, payload);
  const id = existing?.id ?? await createCloudScholarshipId(user.id, payload);
  const result = await client
    .from("scholarships")
    .upsert({ ...payload, id }, { onConflict: "id" })
    .select(CLOUD_FIELDS)
    .single();

  if (result.error || !result.data) throw new Error("The scholarship could not be saved to your cloud workspace.");
  return mapCloudScholarship(result.data);
}

/**
 * Calls the public, rate-limited SearXNG-backed discovery function.
 * A Supabase user session is not required. Only broad state/year filters and
 * selected category IDs are sent; no student record, grades, rank, scores,
 * activities, school, or personal identifiers are sent to the search provider.
 */
export async function runLiveScholarshipDiscovery(
  profile: Record<string, unknown>,
  categories: string[],
): Promise<LiveDiscoveryRun> {
  const client = await requireClient();
  const safeProfile = pickLiveDiscoveryProfile(profile);
  const clientId = getDiscoveryClientId();
  const { data, error } = await client.functions.invoke("scholarship-discover", {
    body: { profile: safeProfile, categories },
    ...(clientId ? { headers: { "x-scout-client-id": clientId } } : {}),
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const response = context.clone();
      const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
      const providerMessage = typeof body?.error === "string"
        ? body.error.trim().slice(0, 500)
        : typeof body?.message === "string" ? body.message.trim().slice(0, 500) : "";
      const retryAfter = response.headers.get("Retry-After");
      const statusSuffix = response.status ? ` (HTTP ${response.status})` : "";
      const retrySuffix = response.status === 429 && retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
      const failure = new Error((providerMessage || `Live scholarship search failed${statusSuffix}.`) + retrySuffix) as Error & {
        status?: number;
        retryAfter?: string;
      };
      failure.status = response.status;
      if (retryAfter) failure.retryAfter = retryAfter;
      throw failure;
    }
    throw new Error("Live scholarship search failed. Check the connection and try again.");
  }
  if (!Array.isArray(data?.results)) throw new Error("The live scholarship search returned an invalid response.");

  // Rank locally with the caller's profile; only safeProfile (state/year) was sent to the search provider.
  const results = rankAndDeduplicateLiveResults(data.results, profile) as LiveScholarship[];
  const rawSummary = data?.summary && typeof data.summary === "object" ? data.summary : {};
  const summary: LiveDiscoverySummary = {
    requestedQueries: Number.isFinite(rawSummary.requestedQueries) ? rawSummary.requestedQueries : 0,
    successfulQueries: Number.isFinite(rawSummary.successfulQueries) ? rawSummary.successfulQueries : 0,
    failedQueries: Number.isFinite(rawSummary.failedQueries) ? rawSummary.failedQueries : 0,
    pagesChecked: Number.isFinite(rawSummary.pagesChecked) ? rawSummary.pagesChecked : 0,
    rawResultCount: Number.isFinite(rawSummary.rawResultCount) ? rawSummary.rawResultCount : data.results.length,
    uniqueResults: results.length,
    ...(Number.isFinite(rawSummary.potentialQueries) ? { potentialQueries: rawSummary.potentialQueries } : {}),
    ...(Number.isFinite(rawSummary.queriesAvoided) ? { queriesAvoided: rawSummary.queriesAvoided } : {}),
    ...(Number.isFinite(rawSummary.retryAttempts) ? { retryAttempts: rawSummary.retryAttempts } : {}),
    ...(typeof rawSummary.cacheHit === "boolean" ? { cacheHit: rawSummary.cacheHit } : {}),
    ...(Number.isFinite(rawSummary.cacheAgeMs) ? { cacheAgeMs: rawSummary.cacheAgeMs } : {}),
  };
  const warnings = Array.isArray(data?.warnings)
    ? data.warnings.filter((value: unknown): value is string => typeof value === "string").slice(0, 5)    : [];

  return { results, summary, warnings };
}

export async function verifyLiveScholarship(_scholarshipId: string): Promise<never> {
  throw new Error("Sponsor verification is not deployed for the existing database.");
}
