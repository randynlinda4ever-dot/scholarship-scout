export async function createCloudScholarshipId(ownerId, payload) {
  const deadline = String(payload?.deadline ?? "");
  const deadlineYear = /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline.slice(0, 4) : "undated";
  const identity = [
    String(ownerId ?? ""),
    String(payload?.official_url ?? "").trim().toLowerCase(),
    String(payload?.title ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " "),
    String(payload?.sponsor ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " "),
    deadlineYear,
  ].join("\u001f");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
