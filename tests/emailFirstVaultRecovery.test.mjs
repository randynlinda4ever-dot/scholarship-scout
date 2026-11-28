import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vault = await readFile(new URL('../src/lib/localVault.js', import.meta.url), 'utf8');
const deviceKeys = await readFile(new URL('../src/lib/deviceKeyStorage.js', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../src/bootstrap.ts', import.meta.url), 'utf8');

test('unlocking an existing device vault reads its original key rather than generating a replacement', () => {
  const unlock = vault.slice(vault.indexOf('export async function unlockDeviceVault'), vault.indexOf('export async function resetUnrecoverableDeviceVault'));
  assert.match(unlock, /keyProvider = getDeviceVaultKey/);
  assert.doesNotMatch(unlock, /getOrCreateDeviceVaultKey/);
  assert.match(deviceKeys, /DeviceVaultKeyMissingError/);
});

test('lost device key is an explicit recovery state and reset requires confirmation', () => {
  assert.match(vault, /mode: "device-key-missing"/);
  assert.match(vault, /confirmation !== "RESET THIS DEVICE VAULT"/);
  assert.match(bootstrap, /renderAuthenticatedVaultGate/);
});
