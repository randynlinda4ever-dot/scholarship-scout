import { useEffect } from "react";

const ANALYTICS_READY_EVENT = "scholarship-scout:analytics-ready";

/**
 * The first-party consent controller is loaded before the application shell.
 * Mounting this component signals that the versioned legal notice has already
 * been accepted; it never initializes or imports a Google SDK itself.
 */
export function AnalyticsConsentManager(): null {
  useEffect(() => {
    window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));
  }, []);

  return null;
}
