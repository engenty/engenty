import { describe, expect, it } from "vitest";
import { maskApiKey } from "./ai-provider-probe.js";

describe("maskApiKey", () => {
  it("keeps the first and last four characters", () => {
    expect(maskApiKey("sk-or-v1-abcdef1234567890")).toBe("sk-o••••••••7890");
  });

  it("shows only the ending of a short key", () => {
    expect(maskApiKey("short-key")).toBe("••••ey");
  });
});
