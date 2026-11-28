(() => {
  "use strict";

  // Public IDs are supplied only after the adult publisher approves the site.
  // Keep every value empty and advertising disabled until then.
  window.SCHOLARSHIP_SCOUT_ADS_CONFIG = Object.freeze({
    enabled: false,
    publisherId: "",
    publicGuideSlotId: "",
  });
})();
