import { describe, expect, it } from "vitest";
import {
  normalizeAiBaseUrl,
  resolveAiServiceBaseUrlFromRaw,
} from "./ai-url.js";

describe("normalizeAiBaseUrl", () => {
  it("trims and strips trailing slash", () => {
    expect(normalizeAiBaseUrl("  https://ai.engenty.localhost/  ")).toBe(
      "https://ai.engenty.localhost"
    );
  });

  it("returns empty for undefined, null, or blank", () => {
    expect(normalizeAiBaseUrl(undefined)).toBe("");
    expect(normalizeAiBaseUrl(null)).toBe("");
    expect(normalizeAiBaseUrl("   ")).toBe("");
  });
});

describe("resolveAiServiceBaseUrlFromRaw", () => {
  it("returns undefined when env key absent or blank", () => {
    expect(resolveAiServiceBaseUrlFromRaw(undefined)).toBeUndefined();
    expect(resolveAiServiceBaseUrlFromRaw("")).toBeUndefined();
    expect(resolveAiServiceBaseUrlFromRaw("   ")).toBeUndefined();
  });

  it("normalizes non-empty values", () => {
    expect(
      resolveAiServiceBaseUrlFromRaw("  https://ai.engenty.localhost/ ")
    ).toBe("https://ai.engenty.localhost");
  });
});
