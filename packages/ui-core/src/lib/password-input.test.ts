import { describe, expect, it } from "vitest";
import {
  generateRandomPassword,
  scorePasswordStrength,
} from "./password-input.js";

describe("scorePasswordStrength", () => {
  it("scores empty / short passwords as weak", () => {
    expect(scorePasswordStrength("").level).toBe("weak");
    expect(scorePasswordStrength("abc").level).toBe("weak");
  });

  it("scores a mixed long password as strong", () => {
    const result = scorePasswordStrength("Abcd1234!xyz");
    expect(result.level).toBe("strong");
    expect(result.score).toBeGreaterThanOrEqual(75);
  });
});

describe("generateRandomPassword", () => {
  it("returns the requested length", () => {
    expect(generateRandomPassword(16)).toHaveLength(16);
    expect(generateRandomPassword(24)).toHaveLength(24);
  });

  it("returns distinct values across calls", () => {
    const a = generateRandomPassword();
    const b = generateRandomPassword();
    expect(a).not.toBe(b);
  });
});
