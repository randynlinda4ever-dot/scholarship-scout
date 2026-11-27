const GENERIC_DISCOVERY_ERROR = "Live scholarship search could not be completed. Check your connection and try again.";

export function getDiscoveryErrorMessage(error) {
  if (!error || typeof error !== "object") return GENERIC_DISCOVERY_ERROR;
  const status = Number(error.status);
  const retryAfter = String(error.retryAfter ?? "").trim();
  if (status === 429 && /^\d{1,5}$/.test(retryAfter)) {
    const seconds = Math.max(1, Math.min(86_400, Number(retryAfter)));
    return `Live scholarship search is temporarily rate-limited. Try again in about ${seconds} seconds.`;
  }
  return GENERIC_DISCOVERY_ERROR;
}
