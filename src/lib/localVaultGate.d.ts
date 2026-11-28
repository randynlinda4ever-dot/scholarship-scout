import type { User } from "@supabase/supabase-js";
export function renderAuthenticatedVaultGate(
  root: HTMLElement,
  user: User,
  onUnlocked: () => Promise<unknown>,
  onSignOut: () => Promise<void>,
): Promise<void>;
export function renderLocalVaultGate(
  root: HTMLElement,
  onUnlocked: () => Promise<unknown>,
): Promise<void>;
