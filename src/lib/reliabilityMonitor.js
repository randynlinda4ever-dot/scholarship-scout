export const RELIABILITY_STORAGE_KEY = "scout-local-reliability";
export const RELIABILITY_CHANGE_EVENT = "scout:reliability-change";
export const RELIABILITY_EVENT_TYPES = Object.freeze([
  "runtime_error",
  "unhandled_rejection",
  "react_render_error",
  "storage_write_failure",
]);
const ALLOWED_TYPES = new Set(RELIABILITY_EVENT_TYPES);
const MAX_EVENTS = 25;

function isValidTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function appendReliabilityEvent(events, input, now = new Date()) {
  if (!input || !ALLOWED_TYPES.has(input.type)) return Array.isArray(events) ? events.slice(-MAX_EVENTS) : [];
  const occurredAt = input.occurredAt ?? (now instanceof Date ? now.toISOString() : "");
  if (!isValidTimestamp(occurredAt)) return Array.isArray(events) ? events.slice(-MAX_EVENTS) : [];
  const safe = Array.isArray(events) ? events.filter((entry) =>
    entry && ALLOWED_TYPES.has(entry.type) && isValidTimestamp(entry.occurredAt)
  ).map(({ type, occurredAt: timestamp }) => ({ type, occurredAt: timestamp })) : [];
  safe.push({ type: input.type, occurredAt });
  return safe.slice(-MAX_EVENTS);
}

export function readReliabilityEvents(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(RELIABILITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) =>
      entry && ALLOWED_TYPES.has(entry.type) && isValidTimestamp(entry.occurredAt)
    ).map(({ type, occurredAt }) => ({ type, occurredAt })).slice(-MAX_EVENTS);
  } catch {
    return [];
  }
}

function notify(target) {
  try {
    if (typeof target?.dispatchEvent === "function" && typeof Event !== "undefined") {
      target.dispatchEvent(new Event(RELIABILITY_CHANGE_EVENT));
    }
  } catch { /* diagnostics must never disrupt the application */ }
}

export function recordReliabilityEvent(type, {
  storage = globalThis.localStorage,
  target = globalThis.window,
  now = () => new Date(),
} = {}) {
  if (!ALLOWED_TYPES.has(type)) return readReliabilityEvents(storage);
  try {
    const next = appendReliabilityEvent(readReliabilityEvents(storage), { type }, now());
    storage?.setItem?.(RELIABILITY_STORAGE_KEY, JSON.stringify(next));
    notify(target);
    return next;
  } catch {
    return readReliabilityEvents(storage);
  }
}

export function clearReliabilityEvents(storage = globalThis.localStorage, target = globalThis.window) {
  try { storage?.removeItem?.(RELIABILITY_STORAGE_KEY); } catch { /* storage may be unavailable */ }
  notify(target);
}

export function installReliabilityMonitoring({
  target = globalThis.window,
  storage = globalThis.localStorage,
  now = () => new Date(),
} = {}) {
  if (!target?.addEventListener || !target?.removeEventListener) return () => {};
  const record = (type) => recordReliabilityEvent(type, { storage, target, now });
  const onError = () => record("runtime_error");
  const onRejection = () => record("unhandled_rejection");
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
