import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptedAuthStorage } from "./deviceKeyStorage.js";

type ScoutRuntimeConfig = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

declare global {
  // Vite replaces this expression at build time. AgentGrid's preview runtime
  // can also run the module without Vite build-time injection, so this stays unset.
  var __SCHOLARSHIP_SCOUT_ENV__: ScoutRuntimeConfig | undefined;
}

const runtimeConfig = globalThis.__SCHOLARSHIP_SCOUT_ENV__ ?? {};
const supabaseUrl = (
  runtimeConfig.VITE_SUPABASE_URL ||
  "https://wjrwvempgjvoxlioodse.supabase.co"
).trim();
// A publishable key is intended for browser use. This fallback supports the
// AgentGrid preview runtime, which may not apply Vite's define() configuration.
const SUPABASE_PUBLISHABLE_KEY_FALLBACK = "sb_publishable_SeIypldF2MLN7L91GN4qCQ_q7mUQZiJ";
const publishableKey = (
  runtimeConfig.VITE_SUPABASE_PUBLISHABLE_KEY ||
  SUPABASE_PUBLISHABLE_KEY_FALLBACK
).trim();

export const supabaseConfigured = Boolean(supabaseUrl && publishableKey);

let supabaseClientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Load the Supabase SDK and initialize the browser client on first use.
 * The shared promise avoids duplicate clients and concurrent auth refresh loops.
 */
export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return Promise.resolve(null);
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) => createClient(supabaseUrl, publishableKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: "pkce",
          storage: encryptedAuthStorage,
        },
      }))
      .catch((error) => {
        supabaseClientPromise = null;
        throw error;
      });
  }
  return supabaseClientPromise;
}

/**
 * Stop background refresh before locking the local vault. Do not initialize
 * Supabase just to lock: only an already-created client needs to be stopped.
 */
export async function stopSupabaseAutoRefreshForVaultLock(): Promise<void> {
  const existingClient = supabaseClientPromise;
  if (!existingClient) return;
  const client = await existingClient;
  if (!client) return;
  await client.auth.stopAutoRefresh();
}
