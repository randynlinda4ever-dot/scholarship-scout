import {
  createLocalVault,
  hasDeviceUnlock,
  hasEncryptedVault,
  lockLocalVault,
  unlockLocalVault,
  unlockLocalVaultWithDeviceKey,
  enableLocalVaultDeviceUnlock,
  restoreLocalVaultWithAccountKey,
} from "./localVault.js";
import { getAccountVaultPasskeyKey } from "./accountVaultPasskey.js";
import "./localVaultGate.css";

const FORCE_PASSPHRASE_SESSION_KEY = "scout-vault-force-passphrase";

function requiresPassphraseThisSession() {
  try { return globalThis.sessionStorage?.getItem(FORCE_PASSPHRASE_SESSION_KEY) === "true"; }
  catch { return false; }
}

function clearPassphraseRequirement() {
  try { globalThis.sessionStorage?.removeItem(FORCE_PASSPHRASE_SESSION_KEY); } catch { /* best-effort session cleanup */ }
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function renderLocalVaultGate(root, onUnlocked, {
  ownerId = null,
  allowDeviceUnlock = true,
  guestMode = false,
  accountVaultBackup = null,
  allowAccountRestore = false,
} = {}) {
  let requiresUnlock = await hasEncryptedVault();
  let autoUnlockError = "";
  if (requiresUnlock && allowDeviceUnlock && !requiresPassphraseThisSession() &&
      await hasDeviceUnlock({ ownerId }).catch(() => false)) {
    try {
      await unlockLocalVaultWithDeviceKey({ ownerId });
      await onUnlocked();
      return;
    } catch (reason) {
      autoUnlockError = reason instanceof Error ? reason.message : "Automatic device unlock was unavailable.";
      try { await lockLocalVault(); } catch { /* keep the manual recovery screen available */ }
    }
  }

  const screen = createElement("main", "vault-preflight");
  const panel = createElement("section", "vault-preflight-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "vault-preflight-title");

  const kicker = createElement("p", "vault-preflight-kicker", "LOCAL DATA PROTECTION");
  const title = createElement("h1", "", "");
  title.id = "vault-preflight-title";
  const copy = createElement("p", "vault-preflight-copy", "");
  const warning = createElement(
    "p",
    "vault-preflight-warning",
    "Your passphrase is never sent to a server or saved by Scholarship Scout. If you lose it, the vault cannot be recovered. Keep a separate encrypted backup and store the passphrase somewhere secure.",
  );

  const form = createElement("form", "vault-preflight-form");
  const passLabel = createElement("label", "", "");
  passLabel.append(createElement("span", "", "Vault passphrase"));
  const passInput = createElement("input", "", "");
  passInput.type = "password";
  passInput.required = true;
  passInput.minLength = 12;
  passInput.maxLength = 1024;
  passInput.name = "vault-passphrase";
  passInput.autocomplete = "current-password";
  const passControl = createElement("div", "vault-password-control");
  const passVisibility = createElement("button", "vault-password-toggle", "Show");
  passVisibility.type = "button";
  passVisibility.setAttribute("aria-label", "Show vault passphrase");
  passVisibility.setAttribute("aria-pressed", "false");
  passVisibility.addEventListener("click", () => {
    const visible = passInput.type === "password";
    passInput.type = visible ? "text" : "password";
    passVisibility.textContent = visible ? "Hide" : "Show";
    passVisibility.setAttribute("aria-label", visible ? "Hide vault passphrase" : "Show vault passphrase");
    passVisibility.setAttribute("aria-pressed", String(visible));
  });
  passControl.append(passInput, passVisibility);
  passLabel.append(passControl);

  const confirmLabel = createElement("label", "", "");
  confirmLabel.append(createElement("span", "", "Confirm passphrase"));
  const confirmInput = createElement("input", "", "");
  confirmInput.type = "password";
  confirmInput.required = true;
  confirmInput.minLength = 12;
  confirmInput.maxLength = 1024;
  confirmInput.name = "vault-passphrase-confirm";
  confirmInput.autocomplete = "new-password";
  const confirmControl = createElement("div", "vault-password-control");
  const confirmVisibility = createElement("button", "vault-password-toggle", "Show");
  confirmVisibility.type = "button";
  confirmVisibility.setAttribute("aria-label", "Show confirmation passphrase");
  confirmVisibility.setAttribute("aria-pressed", "false");
  confirmVisibility.addEventListener("click", () => {
    const visible = confirmInput.type === "password";
    confirmInput.type = visible ? "text" : "password";
    confirmVisibility.textContent = visible ? "Hide" : "Show";
    confirmVisibility.setAttribute("aria-label", visible ? "Hide confirmation passphrase" : "Show confirmation passphrase");
    confirmVisibility.setAttribute("aria-pressed", String(visible));
  });
  confirmControl.append(confirmInput, confirmVisibility);
  confirmLabel.append(confirmControl);

  const status = createElement("p", "vault-preflight-status", "");
  status.setAttribute("role", "status");
  const error = createElement("p", "vault-preflight-error", autoUnlockError);
  error.setAttribute("role", "alert");
  error.hidden = !autoUnlockError;
  const restoreButton = createElement("button", "vault-preflight-secondary", "Restore with synced passkey");
  restoreButton.type = "button";
  restoreButton.hidden = !allowAccountRestore || !accountVaultBackup || guestMode;
  const submit = createElement("button", "vault-preflight-button", "");
  submit.type = "submit";
  form.append(passLabel, confirmLabel, status, error, submit);
  if (!restoreButton.hidden) {
    restoreButton.addEventListener("click", async () => {
      if (restoreButton.disabled) return;
      restoreButton.disabled = true;
      restoreButton.textContent = "Waiting for passkey…";
      error.hidden = true;
      status.textContent = "Confirm your synced Scholarship Scout passkey with your device.";
      try {
        const wrappingKey = await getAccountVaultPasskeyKey({
          credentialId: accountVaultBackup.credential_id,
          prfSalt: accountVaultBackup.prf_salt,
        });
        await restoreLocalVaultWithAccountKey(
          accountVaultBackup.encrypted_envelope,
          wrappingKey,
          { ownerId, cloudRevision: accountVaultBackup.revision },
        );
        clearPassphraseRequirement();
        status.textContent = "Encrypted account vault restored. Opening your workspace…";
        await onUnlocked();
      } catch (reason) {
        error.textContent = reason instanceof Error
          ? reason.message
          : "The account vault could not be restored with this passkey. Use your vault passphrase instead.";
        error.hidden = false;
        status.textContent = "Your backup is unchanged. You can try again or enter your vault passphrase.";
        restoreButton.disabled = false;
        restoreButton.textContent = "Try passkey again";
      }
    });
  }

  const footnote = createElement(
    "p",
    "vault-preflight-footnote",
    guestMode
      ? "Guest mode stores this encrypted vault only in this browser. Enter the passphrase again after reopening the browser. Private browsing, browser cleanup, device loss, or storage limits may mean your records are unavailable or were not saved. Guest mode does not sync or provide account recovery."
      : "Your passphrase remains the recovery method and is never sent to the account provider. After a successful sign-in, a non-exportable key can remember this browser. New devices or cleared browser storage require recovery or account-linked passkey access when available. Keep a separate encrypted backup. Device unlock does not protect against malicious code running on this site while the vault is open.",
  );
  panel.append(kicker, title, copy, warning, form, restoreButton, footnote);
  screen.append(panel);
  root.replaceChildren(screen);

  const updateMode = () => {
    title.textContent = requiresUnlock ? "Unlock your local vault" : "Create your encrypted local vault";
    copy.textContent = requiresUnlock
      ? guestMode
        ? "Your student profile, tracker, application drafts, and Resources worksheets are encrypted in this browser. Guest vaults are not linked to an account and require the passphrase every time you reopen the browser."
        : "Your student profile, tracker, application drafts, and Resources worksheets are protected in your local encrypted vault. Your account session uses separate encrypted browser storage. A remembered device opens automatically after account sign-in. If this is a new device, use your passphrase or an available account-linked passkey."
      : guestMode
        ? "Create a local encrypted vault for this browser. Guest mode is not backed up to an account. You will need the passphrase again after leaving or reopening the browser, and browser storage may be cleared."
        : "Scholarship Scout keeps your student profile, tracker, application work, and Resources tools in an encrypted local vault. Choose a recovery passphrase now. After account sign-in, this browser can remember the vault for future visits.";
    confirmLabel.hidden = requiresUnlock;
    confirmInput.required = !requiresUnlock;
    confirmInput.value = "";
    passInput.autocomplete = requiresUnlock ? "current-password" : "new-password";
    submit.textContent = requiresUnlock ? "Unlock and continue" : "Create vault and continue";
    status.textContent = requiresUnlock
      ? "Enter your vault passphrase. At least 12 characters."
      : "Choose a memorable passphrase with at least 12 characters.";
  };
  updateMode();
  passInput.focus();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    error.hidden = true;
    if (!requiresUnlock && passInput.value !== confirmInput.value) {
      error.textContent = "The passphrases do not match.";
      error.hidden = false;
      confirmInput.focus();
      return;
    }

    submit.disabled = true;
    status.textContent = requiresUnlock
      ? "Decrypting your local records…"
      : "Encrypting and verifying existing local records…";
    try {
      if (requiresUnlock) {
        await unlockLocalVault(passInput.value, { ownerId });
      } else {
        await createLocalVault(passInput.value, { ownerId });
        try { await navigator.storage?.persist?.(); } catch { /* browser persistence is best-effort */ }
      }
      if (ownerId && allowDeviceUnlock) {
        try { await enableLocalVaultDeviceUnlock(); }
        catch (deviceError) {
          autoUnlockError = deviceError instanceof Error ? deviceError.message : "This browser could not enable automatic unlock. Keep your vault passphrase for future visits.";
        }
      }
      passInput.value = "";
      confirmInput.value = "";
      clearPassphraseRequirement();
      await onUnlocked();
    } catch (reason) {
      try { await lockLocalVault(); } catch { /* leave the recovery screen available */ }
      const existing = await hasEncryptedVault().catch(() => false);
      if (!requiresUnlock && existing) {
        requiresUnlock = true;
        updateMode();
      }
      error.textContent = reason instanceof Error
        ? reason.message
        : "The encrypted local vault could not be opened. Your existing records have not been intentionally discarded.";
      error.hidden = false;
      status.textContent = "The workspace remains locked.";
      submit.disabled = false;
      passInput.focus();
    }
  });
}
