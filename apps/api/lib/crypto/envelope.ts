import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Envelope encryption (DBD §1 rule 9, TRD §3).
 *
 * Every secret gets its own random 32-byte data key (DEK). The value is encrypted with the DEK
 * (AES-256-GCM, 12-byte IV, 16-byte tag); the DEK is wrapped by a key-encryption key (KEK) from
 * env, also AES-256-GCM, and stored as base64(iv | tag | ciphertext). `kekId` records which KEK
 * wrapped it, so a KEK can be rotated: decrypt looks the KEK up by id (current or previous) and
 * `rewrap` re-wraps the DEK under the current KEK without touching the encrypted value.
 *
 * Optional `aad` (additional authenticated data, e.g. `connections:<id>:apiKey`) binds a
 * ciphertext to the record and field it belongs to, so it can't be copied elsewhere.
 */
export type EncryptedValue = {
  ciphertext: string;
  iv: string;
  tag: string;
  wrappedDek: string;
  kekId: string;
};

export type Kek = { id: string; key: Buffer };
export type Keyring = { current: Kek; previous?: Kek };

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class DecryptionError extends Error {
  readonly code = "decryption_failed";
  constructor(message = "Could not decrypt value") {
    super(message);
    this.name = "DecryptionError";
  }
}

/** Keyring from env. Call at use time so tests and rotation pick up the current values. */
export function envKeyring(): Keyring {
  return {
    current: { id: env.ENCRYPTION_KEK_ID, key: Buffer.from(env.ENCRYPTION_KEK_CURRENT, "base64") },
    previous:
      env.ENCRYPTION_KEK_PREVIOUS && env.ENCRYPTION_KEK_PREVIOUS_ID
        ? {
            id: env.ENCRYPTION_KEK_PREVIOUS_ID,
            key: Buffer.from(env.ENCRYPTION_KEK_PREVIOUS, "base64"),
          }
        : undefined,
  };
}

function seal(key: Buffer, plaintext: Buffer, aad?: Buffer) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function open(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer, aad?: Buffer): Buffer {
  try {
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("bad envelope");
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Deliberately vague: never say which part failed.
    throw new DecryptionError();
  }
}

function wrapDek(kek: Kek, dek: Buffer): string {
  // The KEK id is authenticated so a wrapped DEK can't be relabelled.
  const { iv, tag, ciphertext } = seal(kek.key, dek, Buffer.from(kek.id));
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

function unwrapDek(kek: Kek, wrapped: string): Buffer {
  const raw = Buffer.from(wrapped, "base64");
  if (raw.length !== IV_BYTES + TAG_BYTES + KEY_BYTES) throw new DecryptionError();
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  return open(kek.key, iv, tag, ciphertext, Buffer.from(kek.id));
}

function kekFor(keyring: Keyring, kekId: string): Kek {
  if (keyring.current.id === kekId) return keyring.current;
  if (keyring.previous?.id === kekId) return keyring.previous;
  throw new DecryptionError(`No key available for kek "${kekId}"`);
}

export function encryptSecret(
  plaintext: string,
  options: { keyring?: Keyring; aad?: string } = {},
): EncryptedValue {
  const keyring = options.keyring ?? envKeyring();
  const aad = options.aad ? Buffer.from(options.aad) : undefined;
  const dek = randomBytes(KEY_BYTES);
  try {
    const { iv, tag, ciphertext } = seal(dek, Buffer.from(plaintext, "utf8"), aad);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      wrappedDek: wrapDek(keyring.current, dek),
      kekId: keyring.current.id,
    };
  } finally {
    dek.fill(0);
  }
}

export function decryptSecret(
  value: EncryptedValue,
  options: { keyring?: Keyring; aad?: string } = {},
): string {
  const keyring = options.keyring ?? envKeyring();
  const aad = options.aad ? Buffer.from(options.aad) : undefined;
  const dek = unwrapDek(kekFor(keyring, value.kekId), value.wrappedDek);
  try {
    return open(
      dek,
      Buffer.from(value.iv, "base64"),
      Buffer.from(value.tag, "base64"),
      Buffer.from(value.ciphertext, "base64"),
      aad,
    ).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

/** True when the value is wrapped by a KEK other than the current one. */
export function needsRewrap(value: Pick<EncryptedValue, "kekId">, keyring = envKeyring()): boolean {
  return value.kekId !== keyring.current.id;
}

/**
 * KEK rotation: unwrap the DEK with whichever KEK wrapped it and wrap it again under the current
 * KEK. The encrypted value (ciphertext, iv, tag) is untouched, so no `aad` is needed.
 */
export function rewrap(value: EncryptedValue, keyring: Keyring = envKeyring()): EncryptedValue {
  if (!needsRewrap(value, keyring)) return value;
  const dek = unwrapDek(kekFor(keyring, value.kekId), value.wrappedDek);
  try {
    return { ...value, wrappedDek: wrapDek(keyring.current, dek), kekId: keyring.current.id };
  } finally {
    dek.fill(0);
  }
}

/** Last four characters, for display next to a masked secret. */
export function last4(secret: string): string {
  return secret.slice(-4);
}
