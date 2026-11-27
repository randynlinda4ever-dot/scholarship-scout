/**
 * Return the current app frame's origin for Supabase email callbacks.
 * AgentGrid/Anima embeds the running app in a preview iframe. The callback
 * must return to that same origin so Supabase stores the session where the
 * running app can read it.
 */
export function getMagicLinkRedirectUrl(locationLike = typeof window === "undefined" ? null : window.location) {
  if (!locationLike?.origin || locationLike.origin === "null") {
    throw new Error("The sign-in callback URL is unavailable in this browser.");
  }

  const pathname = typeof locationLike.pathname === "string" && locationLike.pathname.startsWith("/")
    ? locationLike.pathname
    : "/";
  const callback = new URL(pathname, locationLike.origin);
  callback.search = "";
  callback.hash = "";
  if (callback.protocol !== "https:" && callback.hostname !== "localhost") {
    throw new Error("Secure email sign-in requires an HTTPS app origin.");
  }
  return callback.toString();
}
