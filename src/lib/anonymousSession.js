/**
 * Reuse the Supabase session stored for this browser, or create a pseudonymous
 * user on the first explicit live-search request. The profile itself is never
 * copied into the session or sent by this helper.
 */
export async function ensureAnonymousUser(auth) {
  if (
    !auth ||
    typeof auth.getSession !== "function" ||
    typeof auth.signInAnonymously !== "function"
  ) {
    throw new Error("A configured Supabase auth client is required for anonymous access.");
  }

  const current = await auth.getSession();
  if (current.error) {
    throw new Error("Could not check the existing cloud session. Check your connection and try again.");
  }

  const currentUser = current.data?.session?.user;
  if (currentUser) return currentUser;

  const created = await auth.signInAnonymously();
  if (created.error || !created.data?.user) {
    throw new Error(
      "Anonymous cloud access could not start. Enable Anonymous Sign-Ins in the Supabase project settings. If CAPTCHA protection is enabled, configure its challenge in the app.",
    );
  }

  return created.data.user;
}
