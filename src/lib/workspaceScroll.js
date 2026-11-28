const STORAGE_KEY = "scout-workspace-scroll-v1";
const VALID_PATHS = new Set([
  "/", "/discovery", "/cloud-search", "/scholarships",
  "/application-prep", "/eligibility", "/resources", "/settings",
]);

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

function readPositions(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([path, value]) =>
      VALID_PATHS.has(path) && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000
    ));
  } catch {
    return {};
  }
}

export function getWorkspaceScrollPosition(path, storage) {
  if (!VALID_PATHS.has(path)) return 0;
  return readPositions(resolveStorage(storage))[path] || 0;
}

export function saveWorkspaceScrollPosition(path, scrollY, storage) {
  if (!VALID_PATHS.has(path) || !Number.isFinite(scrollY)) return false;
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return false;
  const offset = Math.max(0, Math.min(10_000_000, Math.round(scrollY)));
  try {
    const positions = readPositions(targetStorage);
    positions[path] = offset;
    targetStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    return true;
  } catch {
    return false;
  }
}
