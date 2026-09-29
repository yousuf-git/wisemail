import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  DecryptionError,
  decryptSecret,
  encryptSecret,
  last4,
  needsRewrap,
  rewrap,
  type Keyring,
} from "@/lib/crypto/envelope";

const kek = (id: string) => ({ id, key: randomBytes(32) });
const ring = (current = kek("k2"), previous?: ReturnType<typeof kek>): Keyring => ({
  current,
  previous,
});

describe("envelope encryption", () => {
  it("round-trips and never stores the plaintext", () => {
    const keyring = ring();
    const secret = "re_live_abcdefghijklmnop";
    const value = encryptSecret(secret, { keyring });
    expect(decryptSecret(value, { keyring })).toBe(secret);
    expect(JSON.stringify(value)).not.toContain(secret);
    expect(value.kekId).toBe("k2");
    // wrappedDek = base64(iv 12 | tag 16 | dek 32)
    expect(Buffer.from(value.wrappedDek, "base64")).toHaveLength(60);
    expect(Buffer.from(value.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(value.tag, "base64")).toHaveLength(16);
  });

  it("uses a fresh data key and IV per record", () => {
    const keyring = ring();
    const a = encryptSecret("same", { keyring });
    const b = encryptSecret("same", { keyring });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
  });

  it("handles empty and unicode secrets", () => {
    const keyring = ring();
    for (const s of ["", "päss wörd 🔑"]) {
      expect(decryptSecret(encryptSecret(s, { keyring }), { keyring })).toBe(s);
    }
  });

  it.each(["ciphertext", "iv", "tag", "wrappedDek"] as const)(
    "detects tampering with %s",
    (field) => {
      const keyring = ring();
      const value = encryptSecret("top secret", { keyring });
      const raw = Buffer.from(value[field], "base64");
      raw[raw.length - 1]! ^= 1;
      const tampered = { ...value, [field]: raw.toString("base64") };
      expect(() => decryptSecret(tampered, { keyring })).toThrow(DecryptionError);
    },
  );

  it("rejects a relabelled kekId and an unknown one", () => {
    const old = kek("k1");
    const value = encryptSecret("x", { keyring: ring(old) });
    const keyring = ring(kek("k2"), old);
    // Claiming the current KEK wrapped it fails authentication.
    expect(() => decryptSecret({ ...value, kekId: "k2" }, { keyring })).toThrow(DecryptionError);
    expect(() => decryptSecret({ ...value, kekId: "nope" }, { keyring })).toThrow(DecryptionError);
  });

  it("binds ciphertext to its AAD", () => {
    const keyring = ring();
    const value = encryptSecret("x", { keyring, aad: "connections:1:apiKey" });
    expect(decryptSecret(value, { keyring, aad: "connections:1:apiKey" })).toBe("x");
    expect(() => decryptSecret(value, { keyring, aad: "connections:2:apiKey" })).toThrow(
      DecryptionError,
    );
    expect(() => decryptSecret(value, { keyring })).toThrow(DecryptionError);
  });

  it("rotates the KEK: decrypts with the previous KEK, rewraps under the current one", () => {
    const k1 = kek("k1");
    const k2 = kek("k2");
    const value = encryptSecret("rotate me", { keyring: ring(k1), aad: "a" });
    expect(value.kekId).toBe("k1");

    // After rotation k1 is "previous": still readable.
    const rotated = ring(k2, k1);
    expect(needsRewrap(value, rotated)).toBe(true);
    expect(decryptSecret(value, { keyring: rotated, aad: "a" })).toBe("rotate me");

    const rewrapped = rewrap(value, rotated);
    expect(rewrapped.kekId).toBe("k2");
    expect(rewrapped.wrappedDek).not.toBe(value.wrappedDek);
    // The encrypted value itself is untouched.
    expect(rewrapped).toMatchObject({ ciphertext: value.ciphertext, iv: value.iv, tag: value.tag });
    expect(needsRewrap(rewrapped, rotated)).toBe(false);

    // Once k1 is retired, the rewrapped value still decrypts; the old one no longer does.
    const retired = ring(k2);
    expect(decryptSecret(rewrapped, { keyring: retired, aad: "a" })).toBe("rotate me");
    expect(() => decryptSecret(value, { keyring: retired, aad: "a" })).toThrow(DecryptionError);
  });

  it("rewrap is a no-op for values already under the current KEK", () => {
    const keyring = ring();
    const value = encryptSecret("x", { keyring });
    expect(rewrap(value, keyring)).toBe(value);
  });

  it("last4 returns the final four characters", () => {
    expect(last4("re_abcdefgh1234")).toBe("1234");
    expect(last4("ab")).toBe("ab");
  });
});
