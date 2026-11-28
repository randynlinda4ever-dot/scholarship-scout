import { getSupabaseClient, supabaseConfigured } from "./supabaseClient.js";
import { sendMagicLink, signInWithGoogle } from "./scholarshipApi.js";
import { AUTH_EMAIL_COOLDOWN_SECONDS, getAuthCooldownRemainingSeconds } from "./authCooldown.js";
import "./emailAuthGate.css";

const COOLDOWN_KEY = "scout-auth-email-cooldown-until";

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function readCooldown() {
  try {
    return getAuthCooldownRemainingSeconds(Number(sessionStorage.getItem(COOLDOWN_KEY)) || 0);
  } catch {
    return 0;
  }
}

function writeCooldown() {
  const until = Date.now() + AUTH_EMAIL_COOLDOWN_SECONDS * 1000;
  try { sessionStorage.setItem(COOLDOWN_KEY, String(until)); } catch { /* session storage is best-effort */ }
}

export async function renderEmailAuthGate(root, onAuthenticated) {
  document.title = "Sign in — Scholarship Scout";
  const shell = node("main", "email-auth-gate");
  const panel = node("section", "email-auth-panel");
  panel.setAttribute("aria-labelledby", "email-auth-title");

  const mark = node("div", "email-auth-mark", "S");
  mark.setAttribute("aria-hidden", "true");
  const title = node("h1", "", "Sign in to Scholarship Scout");
  title.id = "email-auth-title";
  const intro = node(
    "p",
    "email-auth-intro",
    "Use your email to securely open your scholarship workspace. Your student profile, tracker, and application drafts remain encrypted on this device.",
  );
  const form = node("form", "email-auth-form");
  const label = node("label", "email-auth-label", "Email address");
  const input = node("input", "email-auth-input");
  input.type = "email";
  input.name = "email";
  input.autocomplete = "email";
  input.inputMode = "email";
  input.maxLength = 254;
  input.required = true;
  input.placeholder = "you@example.com";
  label.append(input);

  const status = node("p", "email-auth-status", "");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const error = node("p", "email-auth-error", "");
  error.setAttribute("role", "alert");
  error.hidden = true;
  const submit = node("button", "email-auth-submit", "Email me a sign-in link");
  submit.type = "submit";
  form.append(label, status, error, submit);

  const separator = node("div", "email-auth-separator", "or");
  const googleButton = node("button", "email-auth-google", "Continue with Google");
  googleButton.type = "button";
  googleButton.disabled = !supabaseConfigured;
  googleButton.addEventListener("click", async () => {
    if (!active || checking || !supabaseConfigured) return;
    error.hidden = true;
    status.textContent = "Redirecting to Google sign-in?";
    googleButton.disabled = true;
    try {
      await signInWithGoogle();
    } catch {
      status.textContent = "Your workspace remains locked.";
      error.textContent = "Google sign-in could not be started. Check that Google authentication is enabled, then retry.";
      error.hidden = false;
      googleButton.disabled = false;
    }
  });

  const footnote = node(
    "p",
    "email-auth-footnote",
    "Open the newest sign-in email in this same browser. The link can be used once. Do not forward it or share it with anyone.",
  );
  panel.append(mark, title, intro, form, separator, googleButton, footnote);
  shell.append(panel);
  root.replaceChildren(shell);
  input.focus();

  let active = true;
  let authenticated = false;
  let checking = false;
  let cooldownSeconds = readCooldown();
  let cooldownTimer;
  let authSubscription = null;

  const cleanup = () => {
    active = false;
    if (cooldownTimer !== undefined) window.clearInterval(cooldownTimer);
    authSubscription?.unsubscribe();
  };

  const updateButton = () => {
    submit.disabled = !supabaseConfigured || checking || !input.value.trim() || cooldownSeconds > 0;
    submit.textContent = checking
      ? "Checking sign-in…"
      : cooldownSeconds > 0
        ? `Try again in ${cooldownSeconds}s`
        : "Email me a sign-in link";
  };

  const startCooldown = () => {
    cooldownSeconds = AUTH_EMAIL_COOLDOWN_SECONDS;
    writeCooldown();
    updateButton();
    if (cooldownTimer !== undefined) window.clearInterval(cooldownTimer);
    cooldownTimer = window.setInterval(() => {
      cooldownSeconds = readCooldown();
      updateButton();
      if (cooldownSeconds <= 0) {
        window.clearInterval(cooldownTimer);
        cooldownTimer = undefined;
      }
    }, 1000);
  };

  const finishWithVerifiedUser = async () => {
    if (!active || authenticated || checking) return;
    checking = true;
    updateButton();
    status.textContent = "Verifying your email sign-in…";
    error.hidden = true;
    try {
      const client = await getSupabaseClient();
      if (!client) throw new Error("Email sign-in is not configured for this deployment.");
      const { data, error: userError } = await client.auth.getUser();
      if (userError || !data.user || data.user.is_anonymous ||
          typeof data.user.email !== "string" || !data.user.email ||
          !data.user.email_confirmed_at) {
        throw new Error("A verified email address is required. Request a new sign-in link and open the newest email in this browser.");
      }
      status.textContent = "Signed in. Opening your encrypted workspace?";
      await onAuthenticated(data.user);
      authenticated = true;
      try { sessionStorage.removeItem(COOLDOWN_KEY); } catch { /* storage may be unavailable */ }
      cleanup();
    } catch (reason) {
      checking = false;
      error.textContent = reason instanceof Error
        ? reason.message
        : "Your sign-in could not be verified. Request a new email link and try again.";
      error.hidden = false;
      status.textContent = "Your workspace remains locked.";
      if (reason instanceof Error && reason.message.toLowerCase().includes("verified email") &&
          !form.querySelector("[data-switch-from-anonymous]")) {
        const switchButton = node("button", "email-auth-submit", "Sign out of the unverified session");
        switchButton.type = "button";
        switchButton.dataset.switchFromAnonymous = "true";
        switchButton.addEventListener("click", async () => {
          switchButton.disabled = true;
          try {
            const authClient = await getSupabaseClient();
            const { error: signOutError } = await authClient.auth.signOut({ scope: "local" });
            if (signOutError) throw signOutError;
            error.hidden = true;
            status.textContent = "Temporary session cleared. Enter your email to continue.";
          } catch {
            error.textContent = "The temporary session could not be cleared. Refresh the page and try again.";
            error.hidden = false;
          } finally {
            switchButton.disabled = false;
            updateButton();
          }
        });
        form.append(switchButton);
      }
      updateButton();
    }
  };

  const client = await getSupabaseClient().catch((reason) => {
    error.textContent = reason instanceof Error ? reason.message : "Could not initialize secure email sign-in.";
    error.hidden = false;
    status.textContent = "The workspace cannot be opened until sign-in is available.";
    return null;
  });
  if (!client) {
    submit.disabled = true;
    input.disabled = true;
    googleButton.disabled = true;
    return cleanup;
  }

  const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
    if (!active || !session?.user || (event !== "SIGNED_IN" && event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED" && event !== "USER_UPDATED")) return;
    // Supabase warns against awaiting another auth method inside this callback.
    queueMicrotask(() => { void finishWithVerifiedUser(); });
  });
  authSubscription = authListener.subscription;

  const current = await client.auth.getSession().catch(() => ({ data: { session: null } }));
  if (current.data?.session?.user) {
    await finishWithVerifiedUser();
  } else {
    status.textContent = "Enter your email. We will send a one-time sign-in link.";
    updateButton();
  }

  input.addEventListener("input", updateButton);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!active || checking || cooldownSeconds > 0 || !input.value.trim()) return;
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = "Sending…";
    status.textContent = "Sending a secure sign-in link…";
    try {
      await sendMagicLink(input.value.trim());
      startCooldown();
      status.textContent = "Email sent. Open the newest link in this same browser to finish signing in.";
    } catch (reason) {
      const message = reason instanceof Error ? reason.message.toLowerCase() : "";
      if (message.includes("rate limit") || message.includes("too many")) {
        startCooldown();
        status.textContent = "Email delivery is temporarily rate-limited. Wait for the countdown before retrying.";
      } else {
        error.textContent = "The sign-in email could not be sent. Check the address and connection, then try again.";
        error.hidden = false;
        status.textContent = "No sign-in email was sent.";
      }
    } finally {
      if (active) updateButton();
    }
  });
  return cleanup;
}
