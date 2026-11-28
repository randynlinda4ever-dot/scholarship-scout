import type { User } from "@supabase/supabase-js";
export function renderEmailAuthGate(
  root: HTMLElement,
  onAuthenticated: (user: User) => Promise<void>,
): Promise<() => void>;
