import { afterEach, describe, expect, it, vi } from "vitest";
import {
  engentyEnv,
  isEngentyDevelopmentEnvironment,
} from "./engenty-environment.js";

describe("engentyEnv / isEngentyDevelopmentEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when ENV unset", () => {
    vi.stubEnv("ENV", "");
    expect(engentyEnv()).toBeUndefined();
    expect(isEngentyDevelopmentEnvironment()).toBe(false);
  });

  it("detects development from process.env.ENV", () => {
    vi.stubEnv("ENV", "development");
    expect(engentyEnv()).toBe("development");
    expect(isEngentyDevelopmentEnvironment()).toBe(true);
  });

  it("is case-insensitive for development", () => {
    vi.stubEnv("ENV", "Development");
    expect(isEngentyDevelopmentEnvironment()).toBe(true);
  });

  it("does not match other tiers", () => {
    vi.stubEnv("ENV", "staging");
    expect(isEngentyDevelopmentEnvironment()).toBe(false);
  });
});
