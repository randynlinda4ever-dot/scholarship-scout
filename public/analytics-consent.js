(() => {
  "use strict";

  const CONSENT_KEY = "scholarship-scout.analytics-consent.v1";
  const GTM_ID = "GTM-T6NTTR5X";
  const GTM_SRC = "https://www.googletagmanager.com/gtm.js?id=" + GTM_ID;
  const PRODUCTION_HOST = "scholarship-scout.org";
  const READY_EVENT = "scholarship-scout:analytics-ready";
  const MANAGE_EVENT = "scholarship-scout:manage-analytics";
  const PAGE_EVENT = "scholarship-scout:page-view";
  const DENIED_CONSENT = {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
  const GRANTED_CONSENT = {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
  const PAGE_TYPES = new Set([
    "home",
    "api_docs",
    "scholarship_guides",
    "high_school_juniors",
    "texas_scholarships",
    "scholarships_by_gpa",
    "scholarships_by_major",
    "overview",
    "discovery",
    "cloud_search",
    "scholarships",
    "application_prep",
    "resources",
    "profile",
    "settings",
  ]);

  // Preview deployments and local development never initialize third-party tags.
  if (window.location.hostname !== PRODUCTION_HOST) return;

  let consent = readConsent();
  let gtmLoaded = false;
  let lastPageType = null;
  let banner = null;
  let preferences = null;
  let privacyButton = null;

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

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createButton(action, label, className) {
    const button = createElement("button", className, label);
    button.type = "button";
    button.setAttribute("data-analytics-action", action);
    return button;
  }

  function addPrivacyLink() {
    if (privacyButton) return;
    privacyButton = createButton("open-preferences", "Privacy choices", "scout-analytics-privacy-button");
    privacyButton.id = "scout-analytics-open-preferences";
    privacyButton.setAttribute("aria-label", "Open analytics privacy choices");
    privacyButton.addEventListener("click", openPreferences);
    document.body.appendChild(privacyButton);
  }

  function showStorageWarning() {
    if (!banner) return;
    const warning = createElement(
      "p",
      "scout-analytics-warning",
      "Your browser could not save this choice. Analytics will remain off. Check your browser storage settings and try again.",
    );
    banner.appendChild(warning);
  }

  function removePreferences() {
    if (preferences && preferences.parentNode) preferences.parentNode.removeChild(preferences);
    preferences = null;
  }

  function removeBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function closePreferences() {
    removePreferences();
    if (privacyButton) privacyButton.focus?.();
  }

  function openPreferences() {
    if (preferences) {
      preferences.querySelector?.("button")?.focus?.();
      return;
    }

    preferences = createElement("section", "scout-analytics-preferences");
    preferences.id = "scout-analytics-preferences";
    preferences.setAttribute("role", "dialog");
    preferences.setAttribute("aria-modal", "true");
    preferences.setAttribute("aria-labelledby", "scout-analytics-preferences-title");

    const panel = createElement("div", "scout-analytics-dialog");
    const heading = createElement("h2", "", "Analytics privacy choices");
    heading.id = "scout-analytics-preferences-title";
    const description = createElement(
      "p",
      "",
      "Optional analytics helps the site owner understand which broad sections are useful. It is off unless you choose to enable it. If you are under 18, ask a parent or legal guardian to make this choice. Only a fixed page category is sent; Scholarship Scout does not send your profile, eligibility details, scholarship searches, form contents, account identity, or page URL.",
    );
    const status = createElement(
      "p",
      "scout-analytics-status",
      consent === "granted" ? "Optional analytics is currently enabled." : "Optional analytics is currently off.",
    );
    status.setAttribute("aria-live", "polite");

    const actions = createElement("div", "scout-analytics-actions");
    const enable = createButton("accept", "Enable analytics", "scout-analytics-enable");
    const decline = createButton("decline", "Keep analytics off", "scout-analytics-decline");
    const close = createButton("close", "Close", "scout-analytics-close");

    enable.addEventListener("click", acceptAnalytics);
    decline.addEventListener("click", declineAnalytics);
    close.addEventListener("click", closePreferences);

    actions.appendChild(enable);
    actions.appendChild(decline);
    actions.appendChild(close);
    panel.appendChild(heading);
    panel.appendChild(description);
    panel.appendChild(status);
    panel.appendChild(actions);
    preferences.appendChild(panel);
    document.body.appendChild(preferences);
    enable.focus?.();
  }

  function showBanner() {
    if (consent || banner) return;
    banner = createElement("section", "scout-analytics-banner");
    banner.id = "scout-analytics-consent-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-labelledby", "scout-analytics-banner-title");

    const copy = createElement("div", "scout-analytics-copy");
    const heading = createElement("h2", "", "Help improve Scholarship Scout");
    heading.id = "scout-analytics-banner-title";
    const description = createElement(
      "p",
      "",
      "Optional analytics is off by default. If you are under 18, ask a parent or legal guardian to make this choice. You can allow limited, broad page-category measurement or keep it off. No student profile, eligibility, scholarship search, form, or account details are sent. Advertising and ad personalization stay disabled.",
    );
    const actions = createElement("div", "scout-analytics-actions");
    const accept = createButton("accept", "Enable analytics", "scout-analytics-enable");
    const decline = createButton("decline", "Decline", "scout-analytics-decline");
    const details = createButton("details", "More details", "scout-analytics-details");
    accept.addEventListener("click", acceptAnalytics);
    decline.addEventListener("click", declineAnalytics);
    details.addEventListener("click", openPreferences);
    actions.appendChild(accept);
    actions.appendChild(decline);
    actions.appendChild(details);
    copy.appendChild(heading);
    copy.appendChild(description);
    banner.appendChild(copy);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  function pushConsentUpdate(values) {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", values);
    }
  }

  function loadGtm() {
    if (gtmLoaded) {
      pushConsentUpdate(GRANTED_CONSENT);
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(Array.prototype.slice.call(arguments));
    };

    // Basic consent mode: no Google tag is fetched until the visitor opts in.
    window.gtag("consent", "default", DENIED_CONSENT);
    window.gtag("set", "ads_data_redaction", true);
    // Never send OAuth callback URLs, search query strings, page titles, or referrers.
    window.gtag("set", {
      page_location: "https://scholarship-scout.org/",
      page_title: "Scholarship Scout",
      page_referrer: "",
    });
    window.gtag("consent", "update", GRANTED_CONSENT);
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

    const script = document.createElement("script");
    script.async = true;
    script.id = "scout-google-tag-manager";
    script.src = GTM_SRC;
    document.head.appendChild(script);
    gtmLoaded = true;
  }

  function sendPageView(pageType) {
    if (!PAGE_TYPES.has(pageType)) return;
    lastPageType = pageType;
    if (!gtmLoaded || consent !== "granted") return;
    window.dataLayer.push({
      event: "scout_page_view",
      page_type: pageType,
    });
  }

  function currentPageType() {
    const value = document.body.getAttribute("data-analytics-page-type");
    return PAGE_TYPES.has(value) ? value : null;
  }

  function acceptAnalytics() {
    if (!saveConsent("granted")) return;
    removeBanner();
    removePreferences();
    loadGtm();
    sendPageView(lastPageType || currentPageType());
    addPrivacyLink();
    privacyButton.hidden = false;
  }

  function declineAnalytics() {
    const wasActive = gtmLoaded;
    if (!saveConsent("denied")) return;
    removeBanner();
    removePreferences();

    if (wasActive) {
      pushConsentUpdate(DENIED_CONSENT);
      // Reload so the GTM script is removed from the active page after revocation.
      window.location.reload();
      return;
    }

    addPrivacyLink();
    privacyButton.hidden = false;
  }

  function initializeConsentUi() {
    if (consent === "granted") {
      loadGtm();
      sendPageView(currentPageType());
    } else {
      showBanner();
    }
    addPrivacyLink();
    if (privacyButton) privacyButton.hidden = !consent;
  }

  window.addEventListener(MANAGE_EVENT, openPreferences);
  window.addEventListener(PAGE_EVENT, (event) => {
    const pageType = event && event.detail ? event.detail.pageType : null;
    if (typeof pageType === "string") sendPageView(pageType);
  });

  // The application waits until its legal notice has been accepted. Public guide
  // pages can present the same choice immediately because they have no app gate.
  if (document.body.getAttribute("data-analytics-consent-gated") === "true") {
    window.addEventListener(READY_EVENT, initializeConsentUi, { once: true });
  } else {
    initializeConsentUi();
  }
})();
