import { deployApp } from "@rivet-dev/agentos-apps";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAppHostConfig } from "../config.js";
import { AppRuntime, toBuildFailure } from "../runtime.js";

/**
 * `deployApp()` talks to the Rivet engine on localhost:6420 — it is the build
 * VM, not a pure function. The guard tests below are about what happens ahead
 * of that call, so it is stubbed: unstubbed, a deploy that clears the guards
 * retries `failed to fetch metadata` until the test timeout anywhere no engine
 * happens to be listening, which is every CI runner.
 */
vi.mock("@rivet-dev/agentos-apps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@rivet-dev/agentos-apps")>()),
  deployApp: vi.fn(),
}));

const deployAppMock = vi.mocked(deployApp);

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

  beforeEach(() => {
    deployAppMock.mockReset();
    deployAppMock.mockResolvedValue({
      appId: "deployed",
      namespace: "default",
      pool: "default",
      regions: ["default"],
      release: "rel-1",
    });
  });

  it("rejects oversized source before reaching the build VM", async () => {
    await expect(
      runtime.deploy({
        appId: "too-big",
        files: { "index.html": "x".repeat(2000) },
      })
    ).rejects.toThrow(/over the 1000 byte limit/);
    expect(deployAppMock).not.toHaveBeenCalled();
  });

  it("rejects a traversal app id before reaching the build VM", async () => {
    await expect(
      runtime.deploy({ appId: "../etc", files: {} })
    ).rejects.toThrow(/invalid app id/);
    expect(deployAppMock).not.toHaveBeenCalled();
  });

  it("rejects an id past agentOS's 63-character ceiling", async () => {
    // agentOS raises this as an opaque build failure; catching it here names
    // the id and its length instead.
    await expect(
      runtime.deploy({ appId: `a${"b".repeat(63)}`, files: {} })
    ).rejects.toThrow(/invalid app id .* \(64 chars\)/);
    expect(deployAppMock).not.toHaveBeenCalled();
  });

  it("lets an id at the ceiling through to the build VM", async () => {
    const appId = `a${"b".repeat(62)}`;
    await expect(runtime.deploy({ appId, files: {} })).resolves.toMatchObject({
      release: "rel-1",
    });
    expect(deployAppMock).toHaveBeenCalledWith(
      expect.objectContaining({ appId })
    );
  });

  /**
   * The first deploy into a fresh namespace cold-starts an execution replica
   * and regularly blows agentOS's hardcoded 30 s warm timeout; the identical
   * retry then lands in about a second. Without the retry every new App's
   * first build failed, and the agent — handed a "build failure" with no
   * source problem in it — asked the user to re-paste files instead.
   */
  it("retries once when the execution replica cold-start times out", async () => {
    deployAppMock.mockRejectedValueOnce({
      code: "agentos_apps_replica_warm_timeout",
      message:
        "execution replica did not become ready within warmTimeoutMs 30000",
    });
    await expect(
      runtime.deploy({ appId: "cold-start", files: {} })
    ).resolves.toMatchObject({ release: "rel-1" });
    expect(deployAppMock).toHaveBeenCalledTimes(2);
  });

  it("gives up if the replica times out twice", async () => {
    deployAppMock.mockRejectedValue({
      code: "agentos_apps_replica_warm_timeout",
      message:
        "execution replica did not become ready within warmTimeoutMs 30000",
    });
    await expect(
      runtime.deploy({ appId: "cold-start", files: {} })
    ).rejects.toThrow(/did not become ready/);
    expect(deployAppMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a real build error — the agent must see it at once", async () => {
    deployAppMock.mockRejectedValue({
      code: "agentos_apps_build_failed",
      message: "esbuild: Unexpected token",
      metadata: { stderr: "src/main.tsx:3:1: ERROR", stdout: "" },
    });
    await expect(
      runtime.deploy({ appId: "broken", files: {} })
    ).rejects.toThrow(/Unexpected token/);
    expect(deployAppMock).toHaveBeenCalledTimes(1);
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
