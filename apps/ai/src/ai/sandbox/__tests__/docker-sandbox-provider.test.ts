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
      agentId: "engenty.cli",
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("caps memory, CPU and PIDs so a runaway cannot take the host", () => {
    const options = buildDockerSandboxOptions({
      image: "node:22-slim",
      input: baseInput,
    });

    expect(options.memory).toBe(512 * 1024 * 1024);
    // Swap must equal memory — Docker otherwise grants twice `memory` in swap.
    expect(options.memorySwap).toBe(options.memory);
    expect(options.cpuPeriod).toBe(100_000);
    expect(options.cpuQuota).toBe(100_000);
    expect(options.pidsLimit).toBe(256);
  });

  it("applies env overrides to the cgroup limits", () => {
    vi.stubEnv("ENGENTY_SANDBOX_MEMORY_BYTES", String(256 * 1024 * 1024));
    vi.stubEnv("ENGENTY_SANDBOX_CPUS", "0.5");
    vi.stubEnv("ENGENTY_SANDBOX_PIDS_LIMIT", "64");

    const options = buildDockerSandboxOptions({
      image: "node:22-slim",
      input: baseInput,
    });

    expect(options.memory).toBe(256 * 1024 * 1024);
    expect(options.memorySwap).toBe(256 * 1024 * 1024);
    expect(options.cpuQuota).toBe(50_000);
    expect(options.cpuPeriod).toBe(100_000);
    expect(options.pidsLimit).toBe(64);
  });

  it("locks the container down: no capabilities, no network, capped scratch", () => {
    const options = buildDockerSandboxOptions({
      image: "node:22-slim",
      input: baseInput,
    });

    expect(options.capDrop).toEqual(["ALL"]);
    expect(options.securityOpt).toEqual(["no-new-privileges:true"]);
    // Default is off the network entirely: engenty tools and Code Mode both
    // speak stdio to the host, so nothing legitimate needs the wire.
    expect(options.network).toBe("none");
    expect(options.tmpfs).toEqual({
      // `$HOME` as well as `/tmp`: a read-only root without it breaks every
      // tool that writes a dotfile.
      "/opt/sandbox": "rw,size=64m,mode=1777",
      "/tmp": "rw,size=256m,mode=1777",
    });
    expect(options.readonlyRootfs).toBe(false);
  });

  it("joins the egress network and carries proxy env when one is configured", () => {
    vi.stubEnv("ENGENTY_SANDBOX_EGRESS_NETWORK", "engenty-egress");
    vi.stubEnv("ENGENTY_SANDBOX_EGRESS_PROXY_URL", "http://proxy:8888");

    const options = buildDockerSandboxOptions({
      image: "node:22-slim",
      input: baseInput,
      network: "egress",
    });

    expect(options.network).toBe("engenty-egress");
    expect(options.env).toMatchObject({
      HTTPS_PROXY: "http://proxy:8888",
      HTTP_PROXY: "http://proxy:8888",
      https_proxy: "http://proxy:8888",
    });
  });

  it("falls back to the default bridge when egress is asked for with no proxy", () => {
    const options = buildDockerSandboxOptions({
      image: "node:22-slim",
      input: baseInput,
      network: "egress",
    });

    expect(options.network).toBe("bridge");
    expect(options.env).toEqual({});
  });

  it("lets the caller add env on top of the network plan", () => {
    const options = buildDockerSandboxOptions({
      env: { UV_CACHE_DIR: "/cache/uv" },
      image: "node:22-slim",
      input: baseInput,
    });

    expect(options.env).toEqual({ UV_CACHE_DIR: "/cache/uv" });
  });

  it("mounts the root read-only once the env says every write has a bind", () => {
    vi.stubEnv("ENGENTY_SANDBOX_READONLY_ROOTFS", "true");

    expect(
      buildDockerSandboxOptions({ image: "node:22-slim", input: baseInput })
        .readonlyRootfs
    ).toBe(true);
  });

  it("keys the id by thread AND agent for session lifecycle", () => {
    // A resume is a fresh run id; a `session` sandbox must map to the SAME
    // container across suspend -> approve -> resume (keyed by thread). The
    // agent is in the key too: one conversation can run several agents, and a
    // container carries the HostConfig of whoever created it first.
    const sessionOf = (agentId: string) =>
      buildDockerSandboxId({
        ...baseInput,
        identity: {
          ...baseInput.identity,
          agentId,
          lifecycle: "session",
          runId: "run-resume-999",
          threadId: "019fefba-1421-7a0a-8d61-dbec4497bf7c",
        },
      });

    expect(sessionOf("engenty.cli")).toBe(
      "engenty-session-019fefba-1421-7a0a-8d61-dbec4497bf7c-engenty.cli"
    );
    // The copilot delegating to the CLI agent must not hand it its own
    // container — that is how `network: "egress"` became `none`.
    expect(sessionOf("engenty.copilot")).not.toBe(sessionOf("engenty.cli"));
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
