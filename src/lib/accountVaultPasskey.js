const encoder = new TextEncoder();
const KEY_ALGORITHM = { name: "AES-GCM", length: 256 };

function getCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== "function") {
    throw new Error("Secure passkey recovery is unavailable in this browser.");
  }
  return globalThis.crypto;
}

function toBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("The passkey authenticator returned an invalid recovery result.");
}

function toArrayBuffer(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function encodeBase64Url(value) {
  const bytes = toBytes(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("The stored passkey identifier is malformed.");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length) {
  return getCrypto().getRandomValues(new Uint8Array(length));
}

function getPrfResult(credential) {
  const extensions = credential.getClientExtensionResults?.() ?? {};
  const prf = extensions.prf;
  const first = prf?.results?.first;
  if (!first) {
    throw new Error("This passkey could not derive a recovery key. Use your vault passphrase on this device.");
  }
  const output = toBytes(first);
  if (output.length !== 32) {
    throw new Error("The passkey returned an invalid recovery-key length.");
  }
  return output;
}

function getRpId(rpId) {
  const selected = rpId || globalThis.location?.hostname;
  if (!selected || typeof selected !== "string") {
    throw new Error("Passkey recovery requires a secure website origin.");
  }
  if (globalThis.isSecureContext === false) {
    throw new Error("Passkey recovery requires HTTPS.");
  }
  return selected;
}

function getCredentialContainer(credentials, { requireCreate = false } = {}) {
  const selected = credentials ?? globalThis.navigator?.credentials;
  if (!selected || typeof selected.get !== "function" ||
      (requireCreate && typeof selected.create !== "function")) {
    throw new Error("This browser does not support passkey recovery. Your vault passphrase remains available.");
  }
  return selected;
}

async function deriveWrappingKey(output) {
  return getCrypto().subtle.importKey(
    "raw",
    toArrayBuffer(output),
    KEY_ALGORITHM,
    false,
    ["encrypt", "decrypt"],
  );
}

export async function getAccountVaultPasskeyKey({
  credentialId,
  prfSalt,
  credentials,
  rpId,
} = {}) {
  const container = getCredentialContainer(credentials);
  const selectedRpId = getRpId(rpId);
  const id = decodeBase64Url(credentialId);
  const salt = decodeBase64Url(prfSalt);
  if (id.length < 4 || id.length > 1024 || salt.length !== 32) {
    throw new Error("The saved passkey recovery information is malformed.");
  }

  const challenge = randomBytes(32);
  const credential = await container.get({
    publicKey: {
      challenge: toArrayBuffer(challenge),
      rpId: selectedRpId,
      allowCredentials: [{ type: "public-key", id: toArrayBuffer(id) }],
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: toArrayBuffer(salt) } } },
    },
  });
  if (!credential) {
    throw new Error("Passkey recovery was cancelled. You can use your vault passphrase instead.");
  }
  const publicKeyCredential = credential;
  if (encodeBase64Url(publicKeyCredential.rawId) !== credentialId) {
    throw new Error("A different passkey was selected. Choose the Scholarship Scout passkey or use your vault passphrase.");
  }
  return deriveWrappingKey(getPrfResult(publicKeyCredential));
}

export async function registerAccountVaultPasskey({
  userId,
  displayName,
  credentials,
  rpId,
} = {}) {
  if (typeof userId !== "string" || !userId || encoder.encode(userId).length > 64) {
    throw new TypeError("A valid signed-in account is required to register a passkey.");
  }
  const container = getCredentialContainer(credentials, { requireCreate: true });
  const selectedRpId = getRpId(rpId);
  const salt = randomBytes(32);
  const challenge = randomBytes(32);
  const userHandle = encoder.encode("scholarship-scout:" + userId);
  const credential = await container.create({
    publicKey: {
      challenge: toArrayBuffer(challenge),
      rp: { id: selectedRpId, name: "Scholarship Scout" },
      user: {
        id: toArrayBuffer(userHandle),
        name: userId,
        displayName: displayName || "Scholarship Scout account",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60_000,
      attestation: "none",
      extensions: { prf: { eval: { first: toArrayBuffer(salt) } } },
    },
  });
  if (!credential) {
    throw new Error("Passkey setup was cancelled. Your vault remains available on this device.");
  }
  const publicKeyCredential = credential;
  const extensionResults = publicKeyCredential.getClientExtensionResults?.() ?? {};
  if (extensionResults.prf?.enabled !== true) {
    throw new Error("This authenticator does not support secure passkey-based vault recovery. Your vault passphrase remains the recovery method.");
  }

  const credentialId = encodeBase64Url(publicKeyCredential.rawId);
  const prfSalt = encodeBase64Url(salt);
  // Always test the credential through a real assertion; PRF output may not be
  // returned during registration even when the authenticator supports PRF.
  const wrappingKey = await getAccountVaultPasskeyKey({
    credentialId,
    prfSalt,
    credentials: container,
    rpId: selectedRpId,
  });
  return { credentialId, prfSalt, wrappingKey };
}

export function isAccountVaultPasskeyAvailable(credentials) {
  try {
    getRpId();
    const container = getCredentialContainer(credentials);
    return Boolean(container);
  } catch {
    return false;
  }
}
