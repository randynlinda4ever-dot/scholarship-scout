export const AUTH_EMAIL_COOLDOWN_SECONDS = 60;
export function getAuthCooldownRemainingSeconds(until, now = Date.now()) {
  const expiry = Number(until);
  if (!Number.isFinite(expiry) || expiry <= 0) return 0;
  return Math.max(0, Math.ceil((expiry - Number(now)) / 1000));
}
export function isAuthRateLimitError(error) {
  if (!error || typeof error !== "object") return false;
  const value = error;
  const status = Number(value.status ?? value.statusCode ?? 0);
  const code = String(value.code ?? "").toLowerCase();
  const message = String(value.message ?? "").toLowerCase();
  return status === 429 || code.includes("over_email_send_rate_limit") || /email.{0,30}rate.?limit|rate.?limit.{0,30}email|too many requests/.test(message);
}
export function isExpiredAuthLinkError(code, description = "") {
  const value = String(code ?? "") + " " + String(description ?? "");
  return /otp_expired|token_not_found|invalid.{0,24}expired|expired.{0,24}invalid|one.?time.{0,24}(used|expired)|already.{0,24}used/i.test(value);
}
