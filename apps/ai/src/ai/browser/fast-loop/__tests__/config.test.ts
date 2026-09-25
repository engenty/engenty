import { describe, expect, it } from "vitest";

import {
  isFastLoopEnabled,
  resolveFastLoopMaxSteps,
  resolveFastLoopMinMargin,
} from "../config.js";

const env = (values: Record<string, string | undefined>) => (key: string) =>
  values[key];

describe("fast loop config", () => {
  const JEV = "typesafe-ai/jev";

  it("is off without the switch, and off with the switch but no key", () => {
    expect(isFastLoopEnabled(JEV, env({}))).toBe(false);
    expect(
      isFastLoopEnabled(JEV, env({ ENGENTY_BROWSER_FAST_LOOP: "true" }))
    ).toBe(false);
    expect(isFastLoopEnabled(JEV, env({ TYPESAFE_API_KEY: "k" }))).toBe(false);
  });

  it("is on with switch and a key for the bound classifier", () => {
    expect(
      isFastLoopEnabled(
        JEV,
        env({ ENGENTY_BROWSER_FAST_LOOP: "1", TYPESAFE_API_KEY: "k" })
      )
    ).toBe(true);
    expect(
      isFastLoopEnabled(
        JEV,
        env({ ENGENTY_BROWSER_FAST_LOOP: "false", TYPESAFE_API_KEY: "k" })
      )
    ).toBe(false);
    expect(
      isFastLoopEnabled(
        null,
        env({ ENGENTY_BROWSER_FAST_LOOP: "1", TYPESAFE_API_KEY: "k" })
      )
    ).toBe(false);
  });

  it("falls back to defaults for unusable knob values", () => {
    expect(resolveFastLoopMinMargin(env({}))).toBe(0.1);
    expect(
      resolveFastLoopMinMargin(env({ ENGENTY_BROWSER_FAST_MIN_MARGIN: "0.3" }))
    ).toBe(0.3);
    expect(
      resolveFastLoopMinMargin(env({ ENGENTY_BROWSER_FAST_MIN_MARGIN: "7" }))
    ).toBe(0.1);
    expect(resolveFastLoopMaxSteps(env({}))).toBe(60);
    expect(
      resolveFastLoopMaxSteps(env({ ENGENTY_BROWSER_FAST_MAX_STEPS: "10" }))
    ).toBe(10);
    expect(
      resolveFastLoopMaxSteps(env({ ENGENTY_BROWSER_FAST_MAX_STEPS: "9999" }))
    ).toBe(200);
    expect(
      resolveFastLoopMaxSteps(env({ ENGENTY_BROWSER_FAST_MAX_STEPS: "x" }))
    ).toBe(60);
  });
});
