import { describe, expect, it } from "vitest";
import { generateSecretValue } from "./env-generate.js";

describe("generateSecretValue", () => {
  it("base64-32 decodes to exactly 32 bytes (AES-256-GCM key)", () => {
    const value = generateSecretValue("base64-32");
    // Same check modules/inbox/src/lib/token-crypto.ts performs at runtime.
    expect(Buffer.from(value, "base64").byteLength).toBe(32);
  });

  it("base64url-48 is 64 env-safe chars", () => {
    const value = generateSecretValue("base64url-48");
    expect(value).toHaveLength(64);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces unique values", () => {
    expect(generateSecretValue("base64-32")).not.toBe(
      generateSecretValue("base64-32")
    );
  });
});
