import { NON_CONFIGURABLE_ENV_KEYS } from "@engenty/cli";
import { describe, expect, it } from "vitest";
import { getConfigurableSettings } from "./configurable-settings.js";

describe("getConfigurableSettings", () => {
  it("never exposes a bootstrap secret as configurable", () => {
    const keys = new Set(getConfigurableSettings().map((s) => s.key));
    for (const key of NON_CONFIGURABLE_ENV_KEYS) {
      expect(keys.has(key)).toBe(false);
    }
  });
});
