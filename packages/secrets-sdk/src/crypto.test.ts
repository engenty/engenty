import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptPayload,
  encryptPayload,
  secretAad,
  staticKeyWrapper,
} from "./crypto.js";

// 32-byte base64 key for the static (phase-1) path.
const KEY_B64 = Buffer.alloc(32, 7).toString("base64");

beforeAll(() => {
  process.env.SECRETS_ENC_KEY = KEY_B64;
});

const aad = (
  over: Partial<{ secretId: string; ownerScope: string; ownerId: string }> = {}
) =>
  secretAad({ secretId: "s1", ownerScope: "client", ownerId: "c1", ...over });

describe("payload crypto", () => {
  it("round-trips through the static key wrapper", async () => {
    const { key } = await staticKeyWrapper.keyForEncrypt("t1");
    const plain = JSON.stringify({ username: "alice", password: "hunter2" });
    const blob = encryptPayload(plain, key, aad());
    expect(blob.split(".")).toHaveLength(3); // iv.ct.tag
    const back = await staticKeyWrapper.keyForDecrypt("t1", null);
    expect(decryptPayload(blob, back, aad())).toBe(plain);
  });

  it("AAD binding: a payload cannot be read under a different owner (anti-swap)", async () => {
    const { key } = await staticKeyWrapper.keyForEncrypt("t1");
    const blob = encryptPayload("secret-value", key, aad({ ownerId: "c1" }));
    // Same key, but decrypt with the AAD of a DIFFERENT owner → GCM tag fails.
    expect(() => decryptPayload(blob, key, aad({ ownerId: "c2" }))).toThrow();
    // ...and a different secretId also fails (blob can't be relinked to row s2).
    expect(() => decryptPayload(blob, key, aad({ secretId: "s2" }))).toThrow();
  });

  it("tampered ciphertext fails the auth tag", async () => {
    const { key } = await staticKeyWrapper.keyForEncrypt("t1");
    const [iv, ct, tag] = encryptPayload("v", key, aad()).split(".");
    const flipped = Buffer.from(ct, "base64");
    // Flip one byte so GCM auth fails (avoid ^= — biome bans bitwise ops).
    flipped[0] = ((flipped[0] ?? 0) + 1) % 256;
    const tampered = [iv, flipped.toString("base64"), tag].join(".");
    expect(() => decryptPayload(tampered, key, aad())).toThrow();
  });

  it("missing key env is a hard error, not a silent empty key", async () => {
    const saved = process.env.SECRETS_ENC_KEY;
    process.env.SECRETS_ENC_KEY = "";
    await expect(staticKeyWrapper.keyForEncrypt("t1")).rejects.toThrow(
      /SECRETS_ENC_KEY/
    );
    process.env.SECRETS_ENC_KEY = saved;
  });
});
