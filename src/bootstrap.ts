import {
  LEGAL_ACCEPTANCE_STORAGE_KEY,
  createLegalAcceptanceRecord,
  isCurrentLegalAcceptance,
} from "./legal/acceptance.js";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_SECTIONS,
  LEGAL_ACCEPTANCE_VERSION,
} from "./legal/terms";

const root = document.getElementById("root") as HTMLElement;
if (!root) throw new Error("Scholarship Scout could not find its application root.");

let workspaceStarting = false;

function hasCurrentAcceptance(): boolean {
  try {
    return isCurrentLegalAcceptance(
      window.localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY),
    );
  } catch {
    return false;
  }
}

import { renderLocalVaultGate } from "./lib/localVaultGate.js";
import { lockLocalVault } from "./lib/localVault.js";

async function startWorkspace(): Promise<void> {
  if (workspaceStarting) return;
  workspaceStarting = true;
  root.replaceChildren();
  document.body.removeAttribute("style");
  document.documentElement.style.removeProperty("color-scheme");
  document.title = "Scholarship Scout";
  try {
    await renderLocalVaultGate(root, async () => {
      try {
        await import("./main");
      } catch (error) {
        await lockLocalVault();
        throw error;
      }
    });
  } catch (reason) {
    workspaceStarting = false;
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.textContent = reason instanceof Error
      ? reason.message
      : "Scholarship Scout could not open its encrypted local vault.";
    root.replaceChildren(error);
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderLegalGate(): void {
  document.title = "Review Terms of Service — Scholarship Scout";
  document.documentElement.style.colorScheme = "dark";
  document.body.style.margin = "0";
  document.body.style.background = "#080D1A";
  document.body.style.color = "#F5F3FF";
  document.body.style.fontFamily =
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const style = element("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    .legal-preflight { min-height: 100vh; min-height: 100dvh; padding: 20px; display: grid; place-items: center; }
    .legal-preflight-panel { width: min(100%, 980px); height: calc(100vh - 40px); max-height: calc(100dvh - 40px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #3A365C; border-radius: 18px; background: #11172A; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
    .legal-preflight-header, .legal-preflight-footer { padding: 16px 26px; }
    .legal-preflight-header { border-bottom: 1px solid #302C4C; }
    .legal-preflight-brand { display: flex; align-items: center; gap: 10px; font-weight: 750; letter-spacing: .01em; }
    .legal-preflight-mark { display: block; width: 36px; height: 36px; flex: 0 0 36px; border-radius: 11px; box-shadow: 0 5px 14px #05061255; }
    .legal-preflight-kicker { margin: 10px 0 6px; color: #C3B9FF; font-size: 11px; font-weight: 800; letter-spacing: .13em; }
    .legal-preflight h1 { margin: 0; font-size: clamp(24px, 4vw, 34px); line-height: 1.15; }
    .legal-preflight-intro { max-width: 760px; margin: 8px 0 4px; color: #C9C7D8; font-size: 13px; line-height: 1.5; }
    .legal-preflight-guides { margin: 8px 0 0; font-size: 12px; line-height: 1.5; }
    .legal-preflight-guides a { color: #C3B9FF; font-weight: 700; text-underline-offset: 3px; }
    .legal-preflight-version { margin: 8px 0 0; color: #A8A5BC; font-size: 12px; }
    .legal-preflight-document { min-height: 0; flex: 1 1 auto; overflow: auto; overscroll-behavior: contain; padding: 8px 26px 20px; font-size: 13px; line-height: 1.6; }
    .legal-preflight-document section { max-width: 78ch; margin-inline: auto; padding-top: 15px; }
    .legal-preflight-document h2 { margin: 0 0 8px; color: #E6E1FF; font-size: 16px; }
    .legal-preflight-document p, .legal-preflight-document li { color: #D0CEDB; font-size: 13px; }
    .legal-preflight-document p { margin: 8px 0; }
    .legal-preflight-document ul { padding-left: 22px; }
    .legal-preflight-document li { overflow-wrap: anywhere; margin: 5px 0; }
    .legal-preflight-footer { border-top: 1px solid #302C4C; background: #0E1425; }
    .legal-preflight-status { min-height: 18px; margin: 0 0 8px; color: #C3B9FF; font-size: 12px; }
    .legal-preflight-age-control { display: grid; grid-template-columns: 82px minmax(0, 1fr); align-items: center; gap: 10px; min-width: 0; margin: 0 0 8px; color: #C9C7D8; font-size: 12px; font-weight: 700; }
    .legal-preflight-age-select { width: 100%; min-width: 0; min-height: 40px; padding: 8px 10px; border: 1px solid #3A365C; border-radius: 9px; background: #151D33; color: #E7E4F1; font: inherit; font-weight: 600; }
    .legal-preflight-age-select:focus-visible { outline: 2px solid #D8D0FF; outline-offset: 2px; }
    .legal-preflight-guardian { display: flex; align-items: flex-start; gap: 10px; min-width: 0; color: #E7E4F1; font-size: 12px; line-height: 1.5; cursor: pointer; }
    .legal-preflight-guardian input { flex: 0 0 20px; width: 20px; height: 20px; margin: 1px 0 0; accent-color: #A69AE8; }
    .legal-preflight-guardian[hidden] { display: none !important; }
    .legal-preflight-guardian { margin: 0 0 8px; padding: 9px; border: 1px solid #6C5D9A; border-radius: 9px; background: #211E3A; font-size: 11px; }
    .legal-preflight-check { display: flex; align-items: flex-start; gap: 10px; padding: 9px; border: 1px solid #3A365C; border-radius: 9px; background: #151D33; color: #E7E4F1; font-size: 12px; line-height: 1.5; cursor: pointer; }
    .legal-preflight-check input { flex: 0 0 auto; width: 20px; height: 20px; margin: 1px 0 0; accent-color: #A69AE8; }
    .legal-preflight-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 10px; }
    .legal-preflight-demo { min-height: 46px; padding: 0 16px; border: 1px solid #77739D; border-radius: 10px; background: #202741; color: #E7E4F1; font: inherit; font-weight: 750; cursor: pointer; }
    .legal-preflight-demo:hover { background: #2A3454; }
    .legal-preflight-demo:focus-visible { outline: 3px solid #D8D0FF; outline-offset: 3px; }
    .legal-preflight-demo-note { margin: 10px 0 0; color: #C3B9FF; font-size: 11px; line-height: 1.5; }
    .legal-preflight-accept { min-height: 46px; padding: 0 20px; border: 0; border-radius: 10px; background: #A69AE8; color: #191B39; font: inherit; font-weight: 800; cursor: pointer; }
    .legal-preflight-accept:disabled { cursor: not-allowed; opacity: .42; }
    .legal-preflight-accept:focus-visible, .legal-preflight-document:focus-visible, .legal-preflight-check input:focus-visible { outline: 3px solid #D8D0FF; outline-offset: 3px; }
    .legal-preflight-error { margin: 12px 0 0; color: #FFB9B9; font-size: 12px; }
    .legal-preflight-footnote { margin: 8px 0 0; color: #A8A5BC; font-size: 11px; line-height: 1.4; }
    @media (max-height: 720px) {
      .legal-preflight { padding-top: 10px; padding-bottom: 10px; }
      .legal-preflight-header, .legal-preflight-footer { padding-top: 10px; padding-bottom: 10px; }
      .legal-preflight-kicker { margin-top: 7px; }
      .legal-preflight-status { margin-bottom: 7px; }
      .legal-preflight-actions { margin-top: 7px; }
      .legal-preflight-footnote { margin-top: 6px; }
    }
    @media (max-width: 600px) {
      .legal-preflight { padding: 0; display: block; }
      .legal-preflight-panel { position: relative; width: 100%; height: 100vh; height: 100dvh; max-height: none; min-height: 100vh; min-height: 100dvh; border: 0; border-radius: 0; }
      .legal-preflight-header { padding: 8px 12px 7px; }
      .legal-preflight-footer { padding: 8px 12px max(8px, env(safe-area-inset-bottom)); }
      .legal-preflight-brand { gap: 8px; font-size: 12px; }
      .legal-preflight-brand img { width: 28px; height: 28px; flex-basis: 28px; }
      .legal-preflight-footer {
        position: relative;
        z-index: 1;
        flex: 0 0 auto;
        max-height: none;
        overflow: visible;
        padding-bottom: max(9px, env(safe-area-inset-bottom));
      }
      .legal-preflight-kicker { display: none; }
      .legal-preflight h1 { font-size: 22px; line-height: 1.15; }
      .legal-preflight-intro { margin: 4px 0 0; font-size: 11px; line-height: 1.35; }
      .legal-preflight-guides { display: none; }
      .legal-preflight-version { margin-top: 3px; font-size: 10px; }
      .legal-preflight-document { min-height: 0; padding: 6px 16px 14px; font-size: 12px; }
      .legal-preflight-document section { padding-top: 13px; }
      .legal-preflight-document h2 { font-size: 15px; }
      .legal-preflight-document p, .legal-preflight-document li { font-size: 12px; }
      .legal-preflight-status { min-height: 15px; margin-bottom: 5px; font-size: 10px; }
      .legal-preflight-age-control { grid-template-columns: 64px minmax(0, 1fr); gap: 8px; margin-bottom: 7px; }
      .legal-preflight-age-select { min-height: 40px; padding: 7px 9px; }
      .legal-preflight-guardian { gap: 8px; margin-bottom: 6px; padding: 7px; font-size: 10px; line-height: 1.35; }
      .legal-preflight-check { gap: 8px; padding: 7px; font-size: 11px; line-height: 1.35; }
      .legal-preflight-actions { margin-top: 6px; padding: 0; }
      .legal-preflight-actions button { width: 100%; }
      .legal-preflight-footnote { margin-top: 4px; font-size: 10px; line-height: 1.3; }
    }
    @media (prefers-reduced-motion: no-preference) {
      .legal-preflight-panel { animation: legal-preflight-enter .16s ease-out; }
      @keyframes legal-preflight-enter { from { opacity: .75; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    }
  `;

  const screen = element("main", "legal-preflight");
  const panel = element("section", "legal-preflight-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "legal-preflight-title");
  panel.setAttribute("aria-describedby", "legal-preflight-intro");

  const header = element("header", "legal-preflight-header");
  const brand = element("div", "legal-preflight-brand");
  const brandMark = element("img", "legal-preflight-mark");
  brandMark.setAttribute("src", "/favicon.svg");
  brandMark.alt = "";
  brandMark.setAttribute("aria-hidden", "true");
  brand.append(brandMark);
  brand.append(element("span", undefined, "Scholarship Scout"));
  header.append(brand);
  header.append(element("p", "legal-preflight-kicker", "REQUIRED BEFORE ACCESS"));
  const title = element("h1", undefined, "Terms of Service & Privacy Notice");
  title.id = "legal-preflight-title";
  header.append(title);
  const intro = element(
    "p",
    "legal-preflight-intro",
    "Review the full notice, choose an age group, and confirm your agreement before entering the workspace.",
  );
  intro.id = "legal-preflight-intro";
  header.append(intro);
  const publicGuides = element("p", "legal-preflight-guides");
  const publicGuidesLink = element("a", undefined, "Browse free scholarship guides");
  publicGuidesLink.href = "/scholarship-guides/";
  publicGuides.append(publicGuidesLink);
  header.append(publicGuides);
  header.append(element(
    "p",
    "legal-preflight-version",
    `Effective ${LEGAL_EFFECTIVE_DATE} · Version ${LEGAL_ACCEPTANCE_VERSION}`,
  ));

  const documentRegion = element("div", "legal-preflight-document");
  documentRegion.id = "legal-preflight-document";
  documentRegion.tabIndex = 0;
  documentRegion.setAttribute("role", "region");
  documentRegion.setAttribute(
    "aria-label",
    "Complete Terms of Service and Privacy Notice. Scroll to the end to continue.",
  );

  for (const section of LEGAL_SECTIONS) {
    const sectionNode = element("section");
    sectionNode.append(element("h2", undefined, section.title));
    for (const paragraph of section.paragraphs) {
      sectionNode.append(element("p", undefined, paragraph));
    }
    if (section.bullets?.length) {
      const list = element("ul");
      for (const bullet of section.bullets) {
        list.append(element("li", undefined, bullet));
      }
      sectionNode.append(list);
    }
    documentRegion.append(sectionNode);
  }

  const footer = element("footer", "legal-preflight-footer");
  const status = element("p", "legal-preflight-status", "Scroll to the end to enable acceptance.");
  status.setAttribute("role", "status");

  let ageGroup: "adult" | "minor" | "under13" | "" = "";
  let updateButton: () => void = () => {};
  const ageGroupControl = element("label", "legal-preflight-age-control");
  const ageGroupCaption = element("span", undefined, "Age group");
  const ageGroupSelect = element("select", "legal-preflight-age-select");
  ageGroupSelect.name = "legal-age-group";
  const ageOptions = [
    ["", "Choose an age group"],
    ["adult", "I am 18 or older"],
    ["minor", "I am 13 through 17"],
    ["under13", "I am under 13"],
  ] as const;
  for (const [value, label] of ageOptions) {
    const option = element("option", undefined, label);
    option.value = value;
    ageGroupSelect.append(option);
  }
  const guardianLabel = element("label", "legal-preflight-guardian");
  guardianLabel.hidden = true;
  const guardianCheckbox = element("input");
  guardianCheckbox.type = "checkbox";
  const guardianSpan = element("span", undefined, "Parent or guardian authorization: I am this user's parent or legal guardian. I reviewed this notice and authorize this 13–17-year-old to use Scholarship Scout.");
  guardianLabel.append(guardianCheckbox, guardianSpan);
  ageGroupSelect.addEventListener("change", () => {
    ageGroup = ageGroupSelect.value as "adult" | "minor" | "under13" | "";
    guardianCheckbox.checked = false;
    guardianLabel.hidden = ageGroup !== "minor";
    if (ageGroup === "under13") checkbox.checked = false;
    updateButton();
  });
  ageGroupControl.append(ageGroupCaption, ageGroupSelect);

  const acceptanceLabel = element("label", "legal-preflight-check");
  const checkbox = element("input");
  checkbox.type = "checkbox";
  checkbox.checked = false;
  const acceptanceText = element(
    "span",
    undefined,
    "I have read and agree to the Terms of Service and acknowledge the Privacy Notice, including the Service's stated limits and my responsibilities.",
  );
  acceptanceLabel.append(checkbox, acceptanceText);

  const error = element("p", "legal-preflight-error");
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = element("div", "legal-preflight-actions");
  const acceptButton = element("button", "legal-preflight-accept", "Accept and continue");
  acceptButton.type = "button";
  acceptButton.disabled = true;
  let demoNotice: HTMLElement | null = null;
  if (globalThis.__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__ === true) {
    const demoButton = element(
      "button",
      "legal-preflight-demo",
      "Open synthetic agent test demo",
    );
    demoButton.type = "button";
    demoButton.addEventListener("click", () => {
      window.location.assign("/agent-demo");
    });
    actions.append(demoButton);
    demoNotice = element(
      "p",
      "legal-preflight-demo-note",
      "Preview test environment only. It uses fictional data, does not open the real workspace, and does not record legal acceptance.",
    );
  }
  actions.append(acceptButton);

  const footnote = element(
    "p",
    "legal-preflight-footnote",
    "Age and guardian selections stay on this device; age and guardian identity are not verified.",
  );
  footer.append(status, ageGroupControl, guardianLabel, acceptanceLabel, error, footnote);
  if (demoNotice) footer.append(demoNotice);
  footer.append(actions);
  panel.append(header, documentRegion, footer);
  screen.append(panel);
  root.replaceChildren(style, screen);

  let readToEnd = false;
  updateButton = () => {
    const ageAllowed = ageGroup === "adult" || (ageGroup === "minor" && guardianCheckbox.checked);
    acceptButton.disabled = !checkbox.checked || !readToEnd || !ageAllowed;
    if (ageGroup === "under13") {
      status.textContent = "Scholarship Scout is not available to users under 13.";
    } else if (readToEnd) {
      status.textContent = "You have reached the end of the notice.";
    }
  };
  const updateScrollState = () => {
    if (
      documentRegion.scrollTop + documentRegion.clientHeight >=
      documentRegion.scrollHeight - 12
    ) {
      readToEnd = true;
      status.textContent = "You have reached the end of the notice.";
      updateButton();
    }
  };

  documentRegion.addEventListener("scroll", updateScrollState, { passive: true });
  checkbox.addEventListener("change", () => updateButton());
  guardianCheckbox.addEventListener("change", () => updateButton());
  if (documentRegion.scrollHeight <= documentRegion.clientHeight + 12) {
    readToEnd = true;
    status.textContent = "You have reached the end of the notice.";
  }
  updateButton();
  documentRegion.focus();

  acceptButton.addEventListener("click", async () => {
    const ageAllowed = ageGroup === "adult" || (ageGroup === "minor" && guardianCheckbox.checked);
    if (!checkbox.checked || !readToEnd || !ageAllowed || workspaceStarting) return;
    acceptButton.disabled = true;
    error.hidden = true;
    try {
      const receipt = createLegalAcceptanceRecord(new Date().toISOString(), {
        ageGroup,
        guardianConfirmed: ageGroup === "minor" && guardianCheckbox.checked,
      });
      window.localStorage.setItem(LEGAL_ACCEPTANCE_STORAGE_KEY, receipt);
      if (!isCurrentLegalAcceptance(window.localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY))) {
        throw new Error("Acceptance could not be verified.");
      }
    } catch {
      error.textContent =
        "Scholarship Scout could not save and verify your acceptance in this browser. Check browser storage settings and try again. The workspace remains locked.";
      error.hidden = false;
      updateButton();
      return;
    }
    await startWorkspace();
  });

  updateScrollState();
}

if (hasCurrentAcceptance()) {
  void startWorkspace();
} else {
  renderLegalGate();
}
