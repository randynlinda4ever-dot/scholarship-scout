(() => {
  "use strict";

  const CONSENT_KEY = "scholarship-scout.ads-consent.v1";
  const PRODUCTION_HOST = "scholarship-scout.org";
  const SLOT_ID = "scout-public-guide-ad";
  const CONFIG = window.SCHOLARSHIP_SCOUT_ADS_CONFIG || {};
  const PUBLISHER_ID_PATTERN = /^ca-pub-\d{16}$/;
  const SLOT_ID_PATTERN = /^\d{10}$/;

  if (window.location.hostname !== PRODUCTION_HOST) return;
  if (CONFIG.enabled !== true) return;
  if (!PUBLISHER_ID_PATTERN.test(CONFIG.publisherId || "")) return;
  if (!SLOT_ID_PATTERN.test(CONFIG.publicGuideSlotId || "")) return;

  const slot = document.getElementById(SLOT_ID);
  if (!slot || slot.getAttribute("data-scout-ad-slot") !== "public-guides") return;

  let consent = readConsent();
  let adInitialized = false;
  let panel = null;

  function readConsent() {
    try {
      const value = window.localStorage.getItem(CONSENT_KEY);
      return value === "granted" || value === "denied" ? value : null;
    } catch {
      return null;
    }
  }

  function saveConsent(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
      consent = value;
      return true;
    } catch {
      showStorageWarning();
      return false;
    }
  }

  function createElement(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createButton(action, text) {
    const button = createElement("button", "scout-ads-button", text);
    button.type = "button";
    button.setAttribute("data-ads-action", action);
    return button;
  }

  function showStorageWarning() {
    const warning = panel && panel.querySelector
      ? panel.querySelector("[data-ads-warning]")
      : null;
    if (warning) {
      warning.hidden = false;
      warning.textContent = "Your privacy choice could not be saved. Advertising will remain off in this page.";
    }
  }

  function insertBeforeSlot(node) {
    const parent = slot.parentNode || document.body;
    if (typeof parent.insertBefore === "function") parent.insertBefore(node, slot);
    else parent.appendChild(node);
  }

  function loadAd() {
    if (adInitialized || consent !== "granted") return;

    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = 1;

    const label = createElement("span", "scout-ad-label", "Advertisement");
    const ad = createElement("ins", "adsbygoogle scout-ad-unit");
    ad.setAttribute("data-ad-client", CONFIG.publisherId);
    ad.setAttribute("data-ad-slot", CONFIG.publicGuideSlotId);
    ad.setAttribute("data-ad-format", "auto");
    ad.setAttribute("data-full-width-responsive", "true");
    ad.setAttribute("data-tag-for-age-treatment", "2");
    ad.style.display = "block";

    slot.replaceChildren(label, ad);
    slot.hidden = false;

    const script = document.createElement("script");
    script.id = "scout-adsense-script";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
      encodeURIComponent(CONFIG.publisherId);
    script.addEventListener("error", () => {
      slot.hidden = true;
      slot.replaceChildren();
      adInitialized = false;
    });

    document.head.appendChild(script);
    window.adsbygoogle.push({});
    adInitialized = true;
  }

  function showPreferences() {
    if (!panel) {
      panel = createElement("section", "scout-ads-preferences");
      panel.setAttribute("aria-label", "Advertising preferences");
      panel.setAttribute("aria-live", "polite");

      const heading = createElement("h2", "", "Advertising preferences");
      const description = createElement(
        "p",
        "",
        "Scholarship Scout uses at most one contextual, non-personalized advertisement on this public guide. Ad requests include Google's teen age-treatment signal and do not use student profile or scholarship-search information. Google may still use limited identifiers for frequency capping and aggregated reporting."
      );
      const adultLabel = createElement(
        "label",
        "scout-ads-guardian-label",
        "I am an adult authorized to make this advertising choice for this visitor. For anyone under 18, a parent or legal guardian must make the choice."
      );
      const adultConfirmation = createElement("input", "", "");
      adultConfirmation.type = "checkbox";
      adultConfirmation.setAttribute("data-ads-adult-confirmation", "true");
      adultConfirmation.checked = false;
      adultLabel.appendChild(adultConfirmation);

      const warning = createElement("p", "scout-ads-warning", "");
      warning.hidden = true;
      warning.setAttribute("data-ads-warning", "true");

      const actions = createElement("div", "scout-ads-actions");
      const accept = createButton("accept", "Allow non-personalized ads");
      const decline = createButton("decline", "Keep ads off");
      const withdraw = createButton("withdraw", "Withdraw consent");
      actions.append(accept, decline, withdraw);
      panel.append(heading, description, adultLabel, warning, actions);

      adultConfirmation.addEventListener("change", () => {
        accept.disabled = !adultConfirmation.checked;
      });
      accept.disabled = true;

      accept.addEventListener("click", () => {
        if (adultConfirmation.checked !== true) return;
        if (!saveConsent("granted")) return;
        panel.hidden = true;
        loadAd();
        showPreferenceLink();
      });

      decline.addEventListener("click", () => {
        if (!saveConsent("denied")) return;
        slot.hidden = true;
        panel.hidden = true;
        showPreferenceLink();
      });

      withdraw.addEventListener("click", () => {
        if (!saveConsent("denied")) return;
        slot.hidden = true;
        window.location.reload();
      });

      insertBeforeSlot(panel);
    }

    panel.hidden = false;
    const actions = panel.children[4];
    const accept = actions.children[0];
    const decline = actions.children[1];
    const withdraw = actions.children[2];
    const adultLabel = panel.children[2];
    const adultConfirmation = adultLabel.children[0];

    if (consent === "denied") {
      accept.hidden = true;
      decline.hidden = true;
      withdraw.hidden = true;
      adultLabel.hidden = true;
      const manage = createButton("manage", "Review advertising choice");
      manage.addEventListener("click", () => {
        manage.hidden = true;
        accept.hidden = false;
        decline.hidden = false;
        adultLabel.hidden = false;
        adultConfirmation.checked = false;
        accept.disabled = true;
      });
      actions.appendChild(manage);
    } else {
      accept.hidden = false;
      decline.hidden = false;
      withdraw.hidden = consent !== "granted";
      adultLabel.hidden = false;
      adultConfirmation.checked = consent === "granted";
      accept.disabled = !adultConfirmation.checked;
    }
  }

  function showPreferenceLink() {
    if (document.getElementById("scout-ads-preferences-link")) return;
    const link = createButton("manage", "Ad preferences");
    link.id = "scout-ads-preferences-link";
    link.addEventListener("click", showPreferences);
    insertBeforeSlot(link);
  }

  if (consent === "granted") {
    loadAd();
    showPreferenceLink();
  } else if (consent === "denied") {
    slot.hidden = true;
    showPreferenceLink();
  } else {
    showPreferences();
  }
})();
