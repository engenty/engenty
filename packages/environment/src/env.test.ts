import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  envBoolean,
  envNumber,
  envString,
  findWorkspaceRootFrom,
  loadCoreRuntimeEnv,
  mergeWorkspaceDotEnvLayers,
} from "./env.js";

function coreHostPackageRoot(): string {
  return path.join(findWorkspaceRootFrom(process.cwd()), "apps", "core");
}

describe("@engenty/environment env", () => {
  const touchedKeys = [
    "ENGENTY_ENV_LOADER_TEST_LOAD",
    "ENGENTY_ENV_LOADER_TEST_OVERRIDE",
  ];

  afterEach(() => {
    for (const key of touchedKeys) {
      delete process.env[key];
    }
  });

  it("loadCoreRuntimeEnv merges .env without overriding existing process env", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-env-test-"));
    fs.writeFileSync(
      path.join(tempDir, ".env"),
      "ENGENTY_ENV_LOADER_TEST_LOAD=from-env\nENGENTY_ENV_LOADER_TEST_OVERRIDE=from-dot-env\n"
    );
    fs.writeFileSync(
      path.join(tempDir, ".env.local"),
      "ENGENTY_ENV_LOADER_TEST_LOAD=from-local\n"
    );
    process.env.ENGENTY_ENV_LOADER_TEST_OVERRIDE = "already-set";

    loadCoreRuntimeEnv({
      rootDir: tempDir,
      hostPackageRoot: coreHostPackageRoot(),
    });

    expect(process.env.ENGENTY_ENV_LOADER_TEST_LOAD).toBe("from-local");
    expect(process.env.ENGENTY_ENV_LOADER_TEST_OVERRIDE).toBe("already-set");
  });

  it("mergeWorkspaceDotEnvLayers: workspace .env.local wins over package .env.local", () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-env-pkg-"));
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-env-ws-"));
    fs.writeFileSync(path.join(pkg, ".env.local"), "ENGENTY_SHADOW_TEST=\n");
    fs.writeFileSync(
      path.join(ws, ".env.local"),
      "ENGENTY_SHADOW_TEST=from-workspace-root\n"
    );
    const merged = mergeWorkspaceDotEnvLayers(ws, pkg);
    expect(merged.ENGENTY_SHADOW_TEST).toBe("from-workspace-root");
  });

  it("reads string/boolean/number values from config first, then env, then fallback", () => {
    process.env.TEST_LOAD_ENV = "env-value";
    process.env.TEST_OVERRIDE_ENV = "true";

    expect(envString({}, "missing", "TEST_LOAD_ENV", "fallback")).toBe(
      "env-value"
    );
    expect(
      envString(
        { missing: "config-value" },
        "missing",
        "TEST_LOAD_ENV",
        "fallback"
      )
    ).toBe("config-value");

    expect(envBoolean({}, "flag", "TEST_OVERRIDE_ENV", false)).toBe(true);
    expect(envBoolean({ flag: false }, "flag", "TEST_OVERRIDE_ENV", true)).toBe(
      false
    );
    expect(envBoolean({}, "flag", "NOT_SET", true)).toBe(true);

    expect(envNumber({}, "count", "NOT_SET", 42)).toBe(42);
    expect(envNumber({ count: "7" }, "count", "NOT_SET", 42)).toBe(7);
  });
});
