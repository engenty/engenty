import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./token-crypto.js";

const KEY_ENV = "CONNECTIONS_TOKEN_ENC_KEY";

describe("token-crypto", () => {
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env[KEY_ENV];
    process.env[KEY_ENV] = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[KEY_ENV];
    } else {
      process.env[KEY_ENV] = previous;
    }
  });

  it("round-trips and never stores plaintext", () => {
    const secret = "ya29.a0AfH6SMB-token-value";
    const encrypted = encryptToken(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.split(".")).toHaveLength(3);
    expect(decryptToken(encrypted)).toBe(secret);
  });

  it("produces distinct ciphertexts per call (random IV)", () => {
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("rejects tampered ciphertext (GCM auth)", () => {
    const encrypted = encryptToken("secret");
    const [iv, ct, tag] = encrypted.split(".");
    const flipped = Buffer.from(ct, "base64");
    // biome-ignore lint/suspicious/noBitwiseOperators: intentional — bit-flip tampers the ciphertext to prove GCM auth rejects it
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() =>
      decryptToken([iv, flipped.toString("base64"), tag].join("."))
    ).toThrow();
  });

  it("fails loudly without the key", () => {
    delete process.env[KEY_ENV];
    expect(() => encryptToken("x")).toThrow(/CONNECTIONS_TOKEN_ENC_KEY/);
  });

  it("rejects keys of the wrong size", () => {
    process.env[KEY_ENV] = randomBytes(16).toString("base64");
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
  });
});
