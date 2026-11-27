const STORAGE_KEY = "scholarship-scout.discovery-client-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function defaultStorage() {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

function defaultRandomUUID() {
  try { return globalThis.crypto?.randomUUID?.() ?? ""; } catch { return ""; }
}

export function createDiscoveryClientIdentity({ storage, randomUUID = defaultRandomUUID } = {}) {
  let memoryId = "";
  const resolveStorage = () => storage === undefined ? defaultStorage() : storage;

  return () => {
    const store = resolveStorage();
    try {
      const stored = store?.getItem(STORAGE_KEY) ?? "";
      if (UUID_PATTERN.test(stored)) {
        memoryId = stored.toLowerCase();
        return memoryId;
      }
    } catch { /* use a page-memory identity if sessionStorage is unavailable */ }

    if (memoryId) return memoryId;
    let generated = "";
    try { generated = String(randomUUID() ?? "").trim(); } catch { generated = ""; }
    if (!UUID_PATTERN.test(generated)) return "";
    memoryId = generated.toLowerCase();
    try { store?.setItem(STORAGE_KEY, memoryId); } catch { /* page-memory fallback remains valid */ }
    return memoryId;
  };
}

export const getDiscoveryClientId = createDiscoveryClientIdentity();
