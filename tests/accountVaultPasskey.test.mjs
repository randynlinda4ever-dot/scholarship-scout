import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeBase64Url,
  decodeBase64Url,
  registerAccountVaultPasskey,
  getAccountVaultPasskeyKey,
} from "../src/lib/accountVaultPasskey.js";

test("base64url helpers preserve arbitrary credential and PRF bytes", () => {
  const input = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(decodeBase64Url(encodeBase64Url(input)), input);
});

test("passkey registration requires PRF support and verifies it with an assertion", async () => {
  const credentialId = Uint8Array.from([2, 4, 6, 8, 10, 12, 14, 16]);
  const prfOutput = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  let creationOptions;
  let assertionOptions;
  const credentials = {
    async create(options) {
      creationOptions = options;
      return {
        rawId: credentialId.buffer,
        getClientExtensionResults() { return { prf: { enabled: true } }; },
      };
    },
    async get(options) {
      assertionOptions = options;
      return {
        rawId: credentialId.buffer,
        getClientExtensionResults() { return { prf: { results: { first: prfOutput.buffer } } }; },
      };
    },
  };

  const result = await registerAccountVaultPasskey({
    userId: "d0f50e85-f8d5-4a83-bc2e-00a9cb641123",
    displayName: "Student account",
    credentials,
    rpId: "scholarship-scout.org",
  });

  assert.equal(result.credentialId, encodeBase64Url(credentialId));
  assert.ok(result.prfSalt.length >= 32);
  assert.equal(creationOptions.publicKey.rp.id, "scholarship-scout.org");
  assert.equal(creationOptions.publicKey.authenticatorSelection.residentKey, "required");
  assert.equal(creationOptions.publicKey.authenticatorSelection.userVerification, "required");
  assert.ok(assertionOptions.publicKey.allowCredentials.length === 1);
  assert.ok(result.wrappingKey instanceof CryptoKey);
  assert.equal(result.wrappingKey.extractable, false);
  assert.deepEqual(result.wrappingKey.usages, ["encrypt", "decrypt"]);
});

test("unsupported PRF authenticators cannot be marked as cross-device recovery", async () => {
  const credentials = {
    async create() {
      return { rawId: Uint8Array.from([1, 2, 3, 4]).buffer, getClientExtensionResults() { return { prf: { enabled: false } }; } };
    },
    async get() {
      assert.fail("An assertion must not be attempted when registration reports PRF disabled.");
    },
  };
  await assert.rejects(
    registerAccountVaultPasskey({
      userId: "d0f50e85-f8d5-4a83-bc2e-00a9cb641123",
      displayName: "Student account",
      credentials,
      rpId: "scholarship-scout.org",
    }),
    /does not support secure passkey-based vault recovery/i,
  );
});

test("passkey recovery rejects a missing PRF result or a different credential", async () => {
  const credentialId = encodeBase64Url(Uint8Array.from([2, 4, 6, 8]));
  const salt = encodeBase64Url(Uint8Array.from({ length: 32 }, (_, index) => index));
  const noPrf = {
    async get() {
      return { rawId: Uint8Array.from([2, 4, 6, 8]).buffer, getClientExtensionResults() { return { prf: {} }; } };
    },
  };
  await assert.rejects(
    getAccountVaultPasskeyKey({ credentialId, prfSalt: salt, credentials: noPrf, rpId: "scholarship-scout.org" }),
    /could not derive a recovery key/i,
  );
  const wrongCredential = {
    async get() {
      return { rawId: Uint8Array.from([8, 6, 4, 2]).buffer, getClientExtensionResults() { return { prf: { results: { first: new Uint8Array(32).buffer } } }; } };
    },
  };
  await assert.rejects(
    getAccountVaultPasskeyKey({ credentialId, prfSalt: salt, credentials: wrongCredential, rpId: "scholarship-scout.org" }),
    /different passkey/i,
  );
});
