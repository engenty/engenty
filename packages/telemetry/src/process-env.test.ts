import { afterEach, describe, expect, it, vi } from "vitest";
import {
  env,
  envIsDefined,
  envIsTruthy,
  getLogLevel,
  getProcessLogLevel,
  isDebug,
  isProduction,
  nodeEnv,
} from "./process-env.js";

describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined for missing or blank", () => {
    vi.stubEnv("ENGENTY_TEST_ENV_A", "");
    expect(env("ENGENTY_TEST_ENV_A")).toBeUndefined();
    expect(env("ENGENTY_TEST_ENV_MISSING")).toBeUndefined();
  });

  it("returns trimmed value", () => {
    vi.stubEnv("ENGENTY_TEST_ENV_B", "  x  ");
    expect(env("ENGENTY_TEST_ENV_B")).toBe("x");
  });
});

describe("env with string fallback / envIsTruthy / envIsDefined", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('env(key, "") is always string', () => {
    vi.stubEnv("X", "");
    expect(env("X", "")).toBe("");
    expect(env("MISSING", "")).toBe("");
    vi.stubEnv("Y", " z ");
    expect(env("Y", "")).toBe("z");
  });

  it("envIsTruthy", () => {
    vi.stubEnv("FLAG", "true");
    expect(envIsTruthy("FLAG")).toBe(true);
    vi.stubEnv("FLAG", " true ");
    expect(envIsTruthy("FLAG")).toBe(true);
    vi.stubEnv("FLAG", "TRUE");
    expect(envIsTruthy("FLAG")).toBe(true);
    vi.stubEnv("FLAG", "");
    expect(envIsTruthy("FLAG")).toBe(false);
  });

  it("envIsDefined", () => {
    vi.stubEnv("K", "1");
    expect(envIsDefined("K")).toBe(true);
    vi.stubEnv("K", "  ");
    expect(envIsDefined("K")).toBe(false);
  });
});

describe("LOG_LEVEL helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getLogLevel defaults invalid to info", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    expect(getLogLevel()).toBe("info");
    expect(getProcessLogLevel()).toBe("verbose");
    expect(isDebug()).toBe(false);
  });

  it("treats debug case-insensitively", () => {
    vi.stubEnv("LOG_LEVEL", " DeBuG ");
    expect(getLogLevel()).toBe("debug");
    expect(isDebug()).toBe(true);
  });

  it("is false when unset or other known level", () => {
    vi.stubEnv("LOG_LEVEL", "");
    expect(isDebug()).toBe(false);
    vi.stubEnv("LOG_LEVEL", "info");
    expect(isDebug()).toBe(false);
  });
});

describe("NODE_ENV helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("nodeEnv", () => {
    vi.stubEnv("NODE_ENV", " test ");
    expect(nodeEnv()).toBe("test");
  });

  it("isProduction", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isProduction()).toBe(true);
    vi.stubEnv("NODE_ENV", " development ");
    expect(isProduction()).toBe(false);
  });
});
