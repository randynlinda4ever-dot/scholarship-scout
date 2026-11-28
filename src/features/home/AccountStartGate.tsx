import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AUTH_EMAIL_COOLDOWN_SECONDS,
  getAuthCooldownRemainingSeconds,
  isAuthRateLimitError,
} from "../../lib/authCooldown.js";
import { getSupabaseClient, supabaseConfigured } from "../../lib/supabaseClient";
import { linkGoogleIdentity, sendMagicLink, signInWithGoogle } from "../../lib/scholarshipApi";
import { hasPendingAuthCallbackError } from "../../lib/authRedirect.js";
import { StartHomePage } from "./StartHomePage";

type SignedInUser = {
  id: string;
  email?: string;
  is_anonymous?: boolean;
};

type AccountStartGateProps = {
  onAuthenticated: (user: SignedInUser) => void;
  onContinueGuest: () => void;
};

function readCooldownUntil() {
  try {
    const value = Number(globalThis.sessionStorage?.getItem("scout-auth-email-cooldown-until") || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function AccountStartGate({ onAuthenticated, onContinueGuest }: AccountStartGateProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => globalThis.navigator?.onLine !== false);
  const [authReady, setAuthReady] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(readCooldownUntil);
  const [cooldownSeconds, setCooldownSeconds] = useState(() =>
    getAuthCooldownRemainingSeconds(readCooldownUntil()),
  );
  const completedRef = useRef(false);

  useEffect(() => {
    const updateOnline = () => setOnline(globalThis.navigator?.onLine !== false);
    globalThis.addEventListener?.("online", updateOnline);
    globalThis.addEventListener?.("offline", updateOnline);
    return () => {
      globalThis.removeEventListener?.("online", updateOnline);
      globalThis.removeEventListener?.("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    const interval = globalThis.setInterval(() => {
      setCooldownSeconds(getAuthCooldownRemainingSeconds(cooldownUntil));
    }, 250);
    return () => globalThis.clearInterval(interval);
  }, [cooldownUntil]);

  useEffect(() => {
    let active = true;
    let authEventObserved = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const complete = (user: SignedInUser | null) => {
      if (!user) {
        setAnonymous(false);
        return;
      }
      if (user.is_anonymous) {
        setAnonymous(true);
        setMessage("Connect Google to keep access to this temporary browser account and its saved sponsor records.");
        return;
      }
      if (completedRef.current) return;
      completedRef.current = true;
      onAuthenticated(user);
    };

    void getSupabaseClient().then(async (client) => {
      if (!active) return;
      setAuthReady(true);
      if (!client) {
        setMessage("Account sign-in is not configured in this deployment.");
        return;
      }

      const { data: { subscription: authSubscription } } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        authEventObserved = true;
        const user = session?.user ?? null;
        complete(user ? {
          id: user.id,
          email: user.email,
          is_anonymous: user.is_anonymous,
        } : null);
        if (!user && event === "SIGNED_OUT") setMessage("You are signed out. Sign in to open your workspace.");
      });
      subscription = authSubscription;

      const { data, error } = await client.auth.getSession();
      if (!active || authEventObserved) return;
      if (error) {
        setMessage("Your account session could not be checked. Sign in again to continue.");
        return;
      }
      const user = data.session?.user ?? null;
      complete(user ? {
        id: user.id,
        email: user.email,
        is_anonymous: user.is_anonymous,
      } : null);
      if (!user && hasPendingAuthCallbackError()) {
        setMessage("Sign-in was cancelled or could not be completed. Start a new sign-in below.");
      }
    }).catch(() => {
      if (active) {
        setAuthReady(true);
        setMessage("Account authentication could not be initialized. Refresh the page and try again.");
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [onAuthenticated]);

  const beginCooldown = () => {
    const until = Date.now() + AUTH_EMAIL_COOLDOWN_SECONDS * 1000;
    setCooldownUntil(until);
    setCooldownSeconds(AUTH_EMAIL_COOLDOWN_SECONDS);
    try { globalThis.sessionStorage?.setItem("scout-auth-email-cooldown-until", String(until)); }
    catch { /* storage may be unavailable */ }
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || cooldownSeconds > 0) return;
    if (!supabaseConfigured || !online) {
      setMessage("Account sign-in requires a configured connection and an internet connection.");
      return;
    }
    setBusy(true);
    setMessage("Sending a secure sign-in link…");
    try {
      await sendMagicLink(email.trim());
      beginCooldown();
      setMessage("Sign-in email sent. Open the newest link in this same browser profile to continue.");
    } catch (error) {
      if (isAuthRateLimitError(error)) {
        beginCooldown();
        setMessage("Sign-in emails are temporarily rate-limited. Wait for the countdown before trying again.");
      } else {
        setMessage("Could not send the sign-in link. Check the email address and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const googleSignIn = async () => {
    if (busy || !supabaseConfigured || !online) return;
    setBusy(true);
    setMessage(anonymous ? "Connecting Google to your existing account…" : "Opening Google sign-in…");
    try {
      if (anonymous) await linkGoogleIdentity();
      else await signInWithGoogle();
    } catch (error) {
      const code = String((error as { code?: unknown })?.code ?? "").toLowerCase();
      const detail = error instanceof Error ? error.message.toLowerCase() : "";
      if (code.includes("manual_linking_disabled") || detail.includes("manual linking is disabled")) {
        setMessage("Google account linking is disabled for this project. Use email sign-in or contact the project administrator.");
      } else if (code.includes("identity_already_exists") || code.includes("identity_exists") || detail.includes("identity already exists")) {
        setMessage("That Google identity is already connected to another account. Accounts are not merged automatically.");
      } else if (code.includes("provider_disabled") || code.includes("unsupported_provider") || detail.includes("provider is not enabled")) {
        setMessage("Google sign-in is not enabled for this project. Use email sign-in for now.");
      } else {
        setMessage("Google sign-in could not be started. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <StartHomePage
      email={email}
      onEmailChange={setEmail}
      onEmailSubmit={submitEmail}
      onGoogleSignIn={() => void googleSignIn()}
      onContinueGuest={onContinueGuest}
      onReviewLegal={() => globalThis.window?.dispatchEvent(new Event("scholarship-scout:review-legal"))}
      message={message}
      busy={busy}
      online={online}
      configured={supabaseConfigured}
      authReady={authReady}
      isAnonymous={anonymous}
      cooldownSeconds={cooldownSeconds}
    />
  );
}
