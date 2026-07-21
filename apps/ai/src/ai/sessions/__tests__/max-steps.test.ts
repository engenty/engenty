import { afterEach, describe, expect, it } from "vitest";
import { resolveAgentMaxSteps } from "../max-steps.js";

const ENV_KEY = "ENGENTY_AI_AGENT_MAX_STEPS";

afterEach(() => {
  delete process.env[ENV_KEY];
});

describe("resolveAgentMaxSteps", () => {
  it("defaults to 24 with no override and no env", () => {
    expect(resolveAgentMaxSteps()).toBe(24);
  });

  it("uses the global env default when no per-agent override is given", () => {
    process.env[ENV_KEY] = "30";
    expect(resolveAgentMaxSteps()).toBe(30);
  });

  it("prefers a per-agent override over the env default", () => {
    process.env[ENV_KEY] = "30";
    expect(resolveAgentMaxSteps(12)).toBe(12);
  });

  it("clamps a per-agent override to the hard ceiling (60)", () => {
    expect(resolveAgentMaxSteps(999)).toBe(60);
  });

  it("clamps a per-agent override up to at least 1", () => {
    expect(resolveAgentMaxSteps(0)).toBe(1);
  });

  it("ignores a non-finite override and falls back to the default", () => {
    expect(resolveAgentMaxSteps(Number.NaN)).toBe(24);
  });

  it("clamps the env value to the ceiling too", () => {
    process.env[ENV_KEY] = "500";
    expect(resolveAgentMaxSteps()).toBe(60);
  });
});
