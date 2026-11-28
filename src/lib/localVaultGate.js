import {
  createDeviceVault,
  getLocalVaultStatus,
  lockLocalVault,
  migrateLocalVaultToDevice,
  resetUnrecoverableDeviceVault,
  unlockDeviceVault,
} from "./localVault.js";
import "./localVaultGate.css";

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showMessage(root, titleText, messageText, actionText, action) {
  const screen = createElement("main", "vault-preflight");
  const panel = createElement("section", "vault-preflight-panel");
  const title = createElement("h1", "", titleText);
  const message = createElement("p", "vault-preflight-copy", messageText);
  panel.append(createElement("p", "vault-preflight-kicker", "ENCRYPTED LOCAL WORKSPACE"), title, message);
  if (actionText && action) {
    const button = createElement("button", "vault-preflight-button", actionText);
    button.type = "button";
    button.addEventListener("click", action);
    panel.append(button);
  }
  screen.append(panel);
  root.replaceChildren(screen);
}

export async function renderAuthenticatedVaultGate(root, user, onUnlocked, onSignOut) {
  if (!user || typeof user.id !== "string" || !user.id || user.is_anonymous === true ||
      typeof user.email !== "string" || !user.email || !user.email_confirmed_at) {
    throw new Error("A verified email account is required before the local workspace can open.");
  }

  const screen = createElement("main", "vault-preflight");
  const panel = createElement("section", "vault-preflight-panel");
  const kicker = createElement("p", "vault-preflight-kicker", "EMAIL SIGN-IN VERIFIED");
  const title = createElement("h1", "", "Opening your encrypted workspace");
  const copy = createElement("p", "vault-preflight-copy", "Your local student records stay encrypted on this device. Your email session and local encryption key are stored separately.");
  const status = createElement("p", "vault-preflight-status", "Checking this account's local workspace…");
  status.setAttribute("role", "status");
  const error = createElement("p", "vault-preflight-error", "");
  error.setAttribute("role", "alert");
  error.hidden = true;
  panel.append(kicker, title, copy, status, error);
  screen.append(panel);
  root.replaceChildren(screen);

  const openWorkspace = async (operation) => {
    try {
      status.textContent = "Unlocking and verifying encrypted records…";
      await operation();
      status.textContent = "Workspace unlocked.";
      await onUnlocked();
    } catch (reason) {
      status.textContent = "The workspace remains locked. Existing encrypted data has not been intentionally removed.";
      error.textContent = reason instanceof Error
        ? reason.message
        : "The encrypted local workspace could not be opened.";
      error.hidden = false;
      const recovery = createElement(
        "p",
        "vault-preflight-footnote",
        "Recovery: use the same email account and browser profile, or sign in on the device that holds this workspace. For another device, restore an encrypted Scholarship Scout backup from Settings. Email sign-in does not decrypt a backup or transfer device-only data.",
      );
      if (!panel.contains(recovery)) panel.append(recovery);
      const signOut = createElement("button", "vault-preflight-button", "Sign out");
      signOut.type = "button";
      signOut.addEventListener("click", () => void onSignOut());
      if (!panel.querySelector("[data-vault-signout]")) {
        signOut.dataset.vaultSignout = "true";
        panel.append(signOut);
      }
    }
  };

  let vaultStatus;
  try {
    vaultStatus = await getLocalVaultStatus(user.id);
  } catch (reason) {
    error.textContent = reason instanceof Error ? reason.message : "Could not inspect this browser's encrypted workspace.";
    error.hidden = false;
    status.textContent = "The workspace could not be checked.";
    return;
  }

  if (vaultStatus.mode === "missing") {
    copy.textContent = "This account has no local workspace in this browser. Scholarship Scout will create an encrypted workspace here. You can restore a previously exported encrypted backup from Settings.";
    await openWorkspace(() => createDeviceVault(user.id));
    return;
  }

  if (vaultStatus.mode === "trusted-device") {
    await openWorkspace(() => unlockDeviceVault(user.id));
    return;
  }

  if (vaultStatus.mode === "legacy-passphrase") {
    title.textContent = "One-time local vault migration";
    copy.textContent = "Your existing workspace uses the older passphrase encryption. Enter its current passphrase once to migrate it to this signed-in account on this device. The original encrypted vault is verified before it is replaced; future sign-ins on this device will not require this passphrase.";
    const form = createElement("form", "vault-preflight-form");
    const label = createElement("label");
    label.append(createElement("span", "", "Existing vault passphrase"));
    const input = createElement("input");
    input.type = "password";
    input.name = "legacy-vault-passphrase";
    input.autocomplete = "current-password";
    input.minLength = 12;
    input.maxLength = 1024;
    input.required = true;
    label.append(input);
    const submit = createElement("button", "vault-preflight-button", "Migrate and open workspace");
    submit.type = "submit";
    form.append(label, submit);
    panel.append(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      error.hidden = true;
      await openWorkspace(() => migrateLocalVaultToDevice(input.value, user.id));
      input.value = "";
      if (error.hidden) form.remove();
      else submit.disabled = false;
    });
    input.focus();
    return;
  }

  if (vaultStatus.mode === "device-key-missing") {
    title.textContent = "Recover this device's workspace";
    copy.textContent = "The encrypted workspace exists, but this browser no longer has its original encryption key. Scholarship Scout has preserved the encrypted records and will not replace them automatically. If you have an encrypted backup, you can start a new workspace and restore that backup from Settings.";
    status.textContent = "Existing encrypted records cannot be opened without their original device key or a previously exported backup.";
    const reset = createElement("button", "vault-preflight-button", "Start a new workspace from backup");
    reset.type = "button";
    reset.addEventListener("click", async () => {
      if (!window.confirm("This permanently removes the encrypted workspace that cannot currently be decrypted on this device. Continue only if you have an encrypted backup or accept losing those local records. This does not delete your email account.")) return;
      reset.disabled = true;
      try {
        await resetUnrecoverableDeviceVault(user.id, { confirmation: "RESET THIS DEVICE VAULT" });
        await createDeviceVault(user.id);
        await onUnlocked();
      } catch (reason) {
        error.textContent = reason instanceof Error ? reason.message : "The local workspace could not be reset safely.";
        error.hidden = false;
        reset.disabled = false;
      }
    });
    panel.append(reset);
    const signOut = createElement("button", "vault-preflight-button", "Sign out");
    signOut.type = "button";
    signOut.addEventListener("click", () => void onSignOut());
    panel.append(signOut);
    return;
  }

  if (vaultStatus.mode === "different-account") {
    title.textContent = "This device belongs to another account";
    copy.textContent = "An encrypted workspace already exists in this browser, but it is linked to a different email account. Scholarship Scout will not open, replace, or merge another account's records.";
    status.textContent = "Sign out, then use the email address that originally created this local workspace. To move data to another device, restore an encrypted backup.";
    const signOut = createElement("button", "vault-preflight-button", "Sign out and switch account");
    signOut.type = "button";
    signOut.addEventListener("click", () => void onSignOut());
    panel.append(signOut);
    return;
  }

  title.textContent = "Local workspace recovery required";
  copy.textContent = "The encrypted workspace format is not supported by this version. Your browser data has been left unchanged. Do not clear browser storage or attempt to replace this workspace. Sign in from the original browser/version and export an encrypted backup, or contact support for recovery guidance.";
  status.textContent = "Workspace access is blocked to protect existing records.";
  const signOut = createElement("button", "vault-preflight-button", "Sign out");
  signOut.type = "button";
  signOut.addEventListener("click", () => void onSignOut());
  panel.append(signOut);
}

export async function renderLocalVaultGate(root, onUnlocked) {
  // Kept only for explicit legacy migration tests and recovery tooling.
  const screen = createElement("main", "vault-preflight");
  const panel = createElement("section", "vault-preflight-panel");
  panel.append(
    createElement("p", "vault-preflight-kicker", "LEGACY ENCRYPTED WORKSPACE"),
    createElement("h1", "", "Use an email account to continue"),
    createElement("p", "vault-preflight-copy", "Legacy workspaces are migrated after email sign-in. The old passphrase gate is no longer a primary login method."),
  );
  root.replaceChildren(screen);
  screen.append(panel);
  if (typeof onUnlocked === "function") return;
  return undefined;
}
