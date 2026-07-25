import { describe, expect, it } from "vitest";
import { loadAppHostConfig } from "../config.js";
import { AppRuntime, toBuildFailure } from "../runtime.js";

/**
 * agentOS Apps raises build failures inside the app actor, so by the time they
 * reach us they have crossed an actor RPC boundary and arrive as a plain
 * RivetError — `instanceof AgentOSAppsError` is false even though the shape is
 * intact. An earlier version of this classifier tested by class, which turned
 * every build error into an opaque 500 and left engenty.app-coder with no log to
 * iterate against. These lock in the contract-based detection.
 */
describe("toBuildFailure", () => {
  it("classifies a re-hydrated RivetError carrying an agentos_apps_* code", () => {
    const failure = toBuildFailure({
      code: "agentos_apps_build_failed",
      message: "apps-builder failed with exit code 1",
      metadata: {
        exitCode: 1,
        stderr: 'workspace/index.js:1:33: ERROR: Expected "}" but found "1"',
        stdout: "",
      },
      name: "RivetError",
    });
    expect(failure).not.toBeNull();
    expect(failure?.detail.code).toBe("agentos_apps_build_failed");
    expect(failure?.detail.buildLog).toContain('Expected "}"');
  });

  it("joins stdout and stderr into one log", () => {
    const failure = toBuildFailure({
      code: "agentos_apps_pack_failed",
      message: "tar failed",
      metadata: { stderr: "second", stdout: "first" },
    });
    expect(failure?.detail.buildLog).toBe("first\nsecond");
  });

  it("falls back to the message when no stdio is attached", () => {
    const failure = toBuildFailure({
      code: "agentos_apps_dependency_limit",
      message: "too many dependencies",
    });
    expect(failure?.detail.buildLog).toBe("too many dependencies");
  });

  it("leaves unrelated errors alone so they surface as 500s", () => {
    expect(toBuildFailure(new Error("engine unreachable"))).toBeNull();
    expect(toBuildFailure({ code: "some_other_error" })).toBeNull();
    expect(toBuildFailure(null)).toBeNull();
    expect(toBuildFailure("a string")).toBeNull();
  });
});

describe("AppRuntime.deploy guards", () => {
  const runtime = new AppRuntime({
    hostname: "127.0.0.1",
    internalToken: null,
    maxSourceBytes: 1000,
    perAppNamespace: false,
    port: 8795,
    production: false,
    requestTimeoutMs: 1000,
    scaling: { maxReplicas: 1, minReplicas: 0, targetConcurrency: 1 },
  });

  it("rejects oversized source before reaching the build VM", async () => {
    await expect(
      runtime.deploy({
        appId: "too-big",
        files: { "index.html": "x".repeat(2000) },
      })
    ).rejects.toThrow(/over the 1000 byte limit/);
  });

  it("rejects a traversal app id before reaching the build VM", async () => {
    await expect(runtime.deploy({ appId: "../etc", files: {} })).rejects.toThrow(
      /invalid app id/
    );
  });
});

describe("loadAppHostConfig", () => {
  it("refuses to boot production without a shared secret", () => {
    const previousEnv = process.env.NODE_ENV;
    const previousToken = process.env.ENGENTY_APP_HOST_TOKEN;
    process.env.NODE_ENV = "production";
    process.env.ENGENTY_APP_HOST_TOKEN = "";
    try {
      expect(() => loadAppHostConfig()).toThrow(
        /ENGENTY_APP_HOST_TOKEN is required in production/
      );
    } finally {
      process.env.NODE_ENV = previousEnv;
      if (previousToken === undefined) {
        process.env.ENGENTY_APP_HOST_TOKEN = undefined;
      } else {
        process.env.ENGENTY_APP_HOST_TOKEN = previousToken;
      }
    }
  });

  it("defaults to the SSOT port and scale-to-zero", () => {
    const config = loadAppHostConfig();
    expect(config.port).toBe(8795);
    expect(config.scaling.minReplicas).toBe(0);
  });
});
