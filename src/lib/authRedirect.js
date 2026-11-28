/**
 * Return the current app frame's origin for Supabase email callbacks.
 * The app can run inside a preview iframe. The callback must return to the
 * same origin so Supabase stores the session where the running app can read it.
 */
export function getMagicLinkRedirectUrl(locationLike = typeof window === "undefined" ? null : window.location) {
  if (!locationLike?.origin || locationLike.origin === "null") {
    throw new Error("The sign-in callback URL is unavailable in this browser.");
  }

  const origin = new URL(locationLike.origin);
  const isSecureOrigin = origin.protocol === "https:";
  const isLocalHttpOrigin = origin.protocol === "http:" && origin.hostname === "localhost";
  if (!isSecureOrigin && !isLocalHttpOrigin) {
    throw new Error("Secure email sign-in requires an HTTPS app origin.");
  }

  const pathname = typeof locationLike.pathname === "string" && locationLike.pathname.startsWith("/")
    ? locationLike.pathname
    : "/";
  // Set the path on an already validated origin. Passing a path beginning
  // with "//" to new URL(path, origin) would reinterpret it as a new host.
  const callback = new URL(origin.origin);
  callback.pathname = pathname;
  callback.search = "";
  callback.hash = "";
  if (callback.origin !== origin.origin) {
    throw new Error("The sign-in callback must remain on the current app origin.");
  }
  return callback.toString();
}

function getCallbackParams(locationLike) {
  if (!locationLike) return { search: new URLSearchParams(), hash: new URLSearchParams() };
  const search = new URLSearchParams(typeof locationLike.search === "string" ? locationLike.search : "");
  const hash = new URLSearchParams(typeof locationLike.hash === "string" ? locationLike.hash.replace(/^#/, "") : "");
  return { search, hash };
}

/** Detect OAuth/PKCE and legacy implicit-flow callbacks before the app chooses its initial tab. */
export function hasPendingAuthCallback(locationLike = typeof window === "undefined" ? null : window.location) {
  const { search, hash } = getCallbackParams(locationLike);
  return search.has("code") || search.has("error") || hash.has("access_token") || hash.has("error");
}

export function hasPendingAuthCallbackError(locationLike = typeof window === "undefined" ? null : window.location) {
  const { search, hash } = getCallbackParams(locationLike);
  return search.has("error") || hash.has("error");
}
