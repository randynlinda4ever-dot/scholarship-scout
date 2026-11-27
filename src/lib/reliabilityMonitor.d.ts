export const RELIABILITY_STORAGE_KEY: string;
export const RELIABILITY_CHANGE_EVENT: string;
export const RELIABILITY_EVENT_TYPES: readonly [
  "runtime_error",
  "unhandled_rejection",
  "react_render_error",
  "storage_write_failure"
];
export type ReliabilityEvent = {
  type: (typeof RELIABILITY_EVENT_TYPES)[number];
  occurredAt: string;
};
export function appendReliabilityEvent(events: unknown, input: { type: string; occurredAt?: string }, now?: Date): ReliabilityEvent[];
export function readReliabilityEvents(storage?: Pick<Storage, "getItem">): ReliabilityEvent[];
export function recordReliabilityEvent(type: string, options?: { storage?: Storage; target?: EventTarget; now?: () => Date }): ReliabilityEvent[];
export function clearReliabilityEvents(storage?: Pick<Storage, "removeItem">, target?: EventTarget): void;
export function installReliabilityMonitoring(options?: { target?: EventTarget; storage?: Storage; now?: () => Date }): () => void;
