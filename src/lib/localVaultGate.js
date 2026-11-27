import {
  createLocalVault,
  hasEncryptedVault,
  lockLocalVault,
  unlockLocalVault,
} from "./localVault.js";
import "./localVaultGate.css";

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function renderLocalVaultGate(root, onUnlocked) {
  let requiresUnlock = await hasEncryptedVault();
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
  passLabel.append(passInput);

  const confirmLabel = createElement("label", "", "");
  confirmLabel.append(createElement("span", "", "Confirm passphrase"));
  const confirmInput = createElement("input", "", "");
  confirmInput.type = "password";
  confirmInput.required = true;
  confirmInput.minLength = 12;
  confirmInput.maxLength = 1024;
  confirmInput.name = "vault-passphrase-confirm";
  confirmInput.autocomplete = "new-password";
  confirmLabel.append(confirmInput);

  const status = createElement("p", "vault-preflight-status", "");
  status.setAttribute("role", "status");
  const error = createElement("p", "vault-preflight-error", "");
  error.setAttribute("role", "alert");
  error.hidden = true;
  const submit = createElement("button", "vault-preflight-button", "");
  submit.type = "submit";
  form.append(passLabel, confirmLabel, status, error, submit);

  const footnote = createElement(
    "p",
    "vault-preflight-footnote",
    "Your encrypted vault is stored in this browser's IndexedDB. The encryption key stays in memory only while the workspace is unlocked. Locking or reloading requires the passphrase again. At-rest encryption does not protect against malicious JavaScript running while the vault is unlocked.",
  );
  panel.append(kicker, title, copy, warning, form, footnote);
  screen.append(panel);
  root.replaceChildren(screen);

  const updateMode = () => {
    title.textContent = requiresUnlock ? "Unlock your local vault" : "Create your encrypted local vault";
    copy.textContent = requiresUnlock
      ? "Your profile, tracker, application drafts, and cloud sign-in session are encrypted in this browser. Enter your passphrase to unlock them."
      : "Scholarship Scout protects local student records with a passphrase-protected encrypted vault. Existing records are encrypted and removed from plaintext browser storage only after the encrypted copy passes read-back verification.";
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
        await unlockLocalVault(passInput.value);
      } else {
        await createLocalVault(passInput.value);
        try { await navigator.storage?.persist?.(); } catch { /* browser persistence is best-effort */ }
      }
      passInput.value = "";
      confirmInput.value = "";
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
