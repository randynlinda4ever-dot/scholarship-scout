import type { AccountVaultBackup } from "./scholarshipApi";
export function renderLocalVaultGate(
  root: HTMLElement,
  onUnlocked: () => Promise<void>,
  options?: {
    ownerId?: string | null;
    allowDeviceUnlock?: boolean;
    guestMode?: boolean;
    accountVaultBackup?: AccountVaultBackup | null;
    allowAccountRestore?: boolean;
  },
): Promise<void>;
