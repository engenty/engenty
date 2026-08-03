import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDockerSandboxId,
  buildDockerSandboxOptions,
  DEFAULT_DOCKER_SANDBOX_MOUNT_PATH,
} from "../providers/docker-sandbox-provider.js";
import {
  DEFAULT_SANDBOX_IMAGE,
  resolveSandboxDockerImage,
  resolveSandboxProvider,
} from "../sandbox-env.js";

describe("resolveSandboxProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to docker when nothing requests a provider", () => {
    expect(resolveSandboxProvider()).toBe("docker");
    expect(resolveSandboxProvider("docker")).toBe("docker");
    vi.stubEnv("ENGENTY_SANDBOX_PROVIDER", "docker");
    expect(resolveSandboxProvider()).toBe("docker");
  });

  it("throws loudly on an unsupported provider", () => {
    expect(() => resolveSandboxProvider("local")).toThrow(/not supported/);
    // Removed tiers stay removed — gondolin must fail, not silently degrade.
    vi.stubEnv("ENGENTY_SANDBOX_PROVIDER", "gondolin");
    expect(() => resolveSandboxProvider()).toThrow(/not supported/);
    vi.stubEnv("ENGENTY_SANDBOX_PROVIDER", "firecracker");
    expect(() => resolveSandboxProvider()).toThrow(/not supported/);
  });
});

describe("resolveSandboxDockerImage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses ENGENTY_SANDBOX_DOCKER_IMAGE when set", () => {
    vi.stubEnv("ENGENTY_SANDBOX_DOCKER_IMAGE", "custom/runtime:latest");
    expect(resolveSandboxDockerImage()).toBe("custom/runtime:latest");
  });

  it("returns the unified prebaked image by default", () => {
    expect(resolveSandboxDockerImage()).toBe(DEFAULT_SANDBOX_IMAGE);
  });
});

describe("buildDockerSandboxOptions", () => {
  const baseInput = {
    identity: {
      lifecycle: "run" as const,
      runId: "run-abc",
      tenantId: "tenant-1",
      threadId: "thread-1",
    },
    layout: {
      fileStorageRelativePath: "ai/sandboxes/run-run-abc/workspace/",
      stagingPath: "/tmp/engenty-sandboxes/tenant-1/run-abc",
    },
    timeoutMs: 60_000,
  };

  it("binds staging to the sandbox mount path and keys the id by run scope", () => {
    const options = buildDockerSandboxOptions({
      image: "node:22-slim",
      input: baseInput,
    });

    expect(buildDockerSandboxId(baseInput)).toBe("engenty-run-run-abc");
    expect(options.id).toBe("engenty-run-run-abc");
    expect(options.image).toBe("node:22-slim");
    expect(options.timeout).toBe(60_000);
    expect(options.workingDir).toBe(DEFAULT_DOCKER_SANDBOX_MOUNT_PATH);
    expect(options.volumes).toEqual({
      "/tmp/engenty-sandboxes/tenant-1/run-abc":
        DEFAULT_DOCKER_SANDBOX_MOUNT_PATH,
    });
  });

  it("keys the id by thread for session lifecycle so resume reuses one container", () => {
    // A resume is a fresh run id; a `session` sandbox must map to the SAME
    // container across suspend -> approve -> resume (keyed by thread).
    expect(
      buildDockerSandboxId({
        ...baseInput,
        identity: {
          ...baseInput.identity,
          lifecycle: "session",
          runId: "run-resume-999",
        },
      })
    ).toBe("engenty-session-thread-1");
  });

  it("honors a custom mount path", () => {
    const options = buildDockerSandboxOptions({
      image: "node:22-slim",
      input: baseInput,
      mountPath: "/work",
    });

    expect(options.workingDir).toBe("/work");
    expect(options.volumes).toEqual({
      "/tmp/engenty-sandboxes/tenant-1/run-abc": "/work",
    });
  });

  it("binds extra mounts (tenant /shared AND /home) alongside the sandbox", () => {
    const options = buildDockerSandboxOptions({
      extraMounts: [
        {
          containerPath: "/home",
          layout: {
            fileStorageRelativePath: "ai/workspace/users/user-1/",
            stagingPath: "/tmp/engenty-home/tenant-1/user-1",
          },
        },
        {
          containerPath: "/shared",
          layout: {
            fileStorageRelativePath: "ai/workspace/commons/",
            stagingPath: "/tmp/engenty-commons/tenant-1",
          },
        },
      ],
      image: "node:22-slim",
      input: baseInput,
    });

    // `/home` and `/shared` share the same staged+bind mechanism as the sandbox.
    expect(options.volumes).toEqual({
      "/tmp/engenty-home/tenant-1/user-1": "/home",
      "/tmp/engenty-commons/tenant-1": "/shared",
      "/tmp/engenty-sandboxes/tenant-1/run-abc":
        DEFAULT_DOCKER_SANDBOX_MOUNT_PATH,
    });
  });
});
