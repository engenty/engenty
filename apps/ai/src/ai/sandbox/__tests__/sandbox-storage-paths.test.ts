import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveSandboxCachePaths } from "../../workspace/local-workspace-paths.js";
import {
  resolveSandboxScopeKey,
  resolveSandboxStorageLayout,
  resolveSpaceComputerHomePath,
} from "../sandbox-storage-paths.js";
import {
  resolveUserBrowserDownloadsPath,
  resolveUserBrowserProfilePath,
} from "../space-browser.js";

const THREAD = "019fefba-1421-7a0a-8d61-dbec4497bf7c";

const baseIdentity = {
  agentId: "engenty.cli",
  lifecycle: "run" as const,
  runId: "run-abc",
  tenantId: "tenant-1",
  threadId: THREAD,
};

describe("resolveSandboxStorageLayout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("roots a spaced run's scratch under the space", () => {
    const root = path.join(os.tmpdir(), "engenty-layout");
    vi.stubEnv("ENGENTY_SPACES_DIR", root);

    const layout = resolveSandboxStorageLayout({
      ...baseIdentity,
      spaceId: "space-9",
    });

    // The mounts a spaced run gets are space-rooted, so its scratch must be
    // too — otherwise two spaces of one tenant share a staging dir.
    expect(layout.stagingPath).toBe(
      path.join(
        root,
        "tenants",
        "tenant-1",
        "spaces",
        "space-9",
        "ai",
        "sandboxes",
        "run-run-abc",
        "workspace"
      )
    );
    expect(layout.spaceId).toBe("space-9");
  });

  it("stays tenant-rooted without a space", () => {
    const root = path.join(os.tmpdir(), "engenty-layout");
    vi.stubEnv("ENGENTY_SPACES_DIR", root);

    const layout = resolveSandboxStorageLayout(baseIdentity);

    expect(layout.stagingPath).toBe(
      path.join(
        root,
        "tenants",
        "tenant-1",
        "ai",
        "sandboxes",
        "run-run-abc",
        "workspace"
      )
    );
    expect(layout.spaceId).toBeUndefined();
  });
});

describe("the Space drive", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Deleting a Space's one folder must remove everything the host keeps for
  // it. Ways this fails: a path is rooted per tenant with the space last
  // (the old browser profile), or under another root; or the computer's
  // /sandbox is still synced to object storage, so the folder is not the only
  // copy and a stale upload overwrites it on the next pull.
  it("holds every host path of a Space, and the computer's /sandbox is not synced", () => {
    const root = path.join(os.tmpdir(), "engenty-drive");
    vi.stubEnv("ENGENTY_SPACES_DIR", root);
    const space = { spaceId: "space-9", tenantId: "tenant-1" };
    const folder = path.join(root, "tenants", "tenant-1", "spaces", "space-9");

    const layout = resolveSandboxStorageLayout({
      ...baseIdentity,
      lifecycle: "space",
      spaceId: "space-9",
    });
    const paths = [
      layout.stagingPath,
      resolveSpaceComputerHomePath("tenant-1", "space-9"),
      resolveUserBrowserProfilePath(space),
      resolveUserBrowserDownloadsPath(space),
      ...Object.values(resolveSandboxCachePaths("tenant-1", "space-9")),
    ];
    for (const p of paths) {
      expect(p.startsWith(`${folder}${path.sep}`)).toBe(true);
    }
    expect(new Set(paths).size).toBe(paths.length);
    expect(layout.fileStorageRelativePath).toBe("");
  });
});

describe("resolveSandboxScopeKey", () => {
  it("keys run by its id and session by thread AND agent", () => {
    expect(resolveSandboxScopeKey(baseIdentity)).toBe("run-run-abc");
    // Two agents in one conversation are two computers: a shared container
    // would give the second whatever HostConfig the first created it with.
    expect(
      resolveSandboxScopeKey({ ...baseIdentity, lifecycle: "session" })
    ).toBe(`session-${THREAD}-engenty.cli`);
    expect(
      resolveSandboxScopeKey({
        ...baseIdentity,
        agentId: "engenty.copilot",
        lifecycle: "session",
      })
    ).toBe(`session-${THREAD}-engenty.copilot`);
  });

  it("qualifies a task key by tenant and space", () => {
    // A task identifier is unique per (tenant, scope) only, so two tenants
    // holding the same one would otherwise collide onto one container.
    expect(
      resolveSandboxScopeKey({
        ...baseIdentity,
        lifecycle: "task",
        spaceId: "space-9",
        taskIdentifier: "invoice-run",
      })
    ).toBe("task-tenant-1-space-9-invoice-run");

    expect(
      resolveSandboxScopeKey({
        ...baseIdentity,
        lifecycle: "task",
        taskIdentifier: "invoice-run",
      })
    ).toBe("task-tenant-1-tenant-invoice-run");
  });

  it("refuses a task lifecycle with no task bound", () => {
    expect(() =>
      resolveSandboxScopeKey({ ...baseIdentity, lifecycle: "task" })
    ).toThrow(/sandbox_task_lifecycle_requires_task_binding/);
  });
});

describe("resolveSandboxScopeKey (space computer)", () => {
  it("keys the machine by tenant and space alone", () => {
    // No run, thread or agent in the key — one container per space is the
    // whole design.
    expect(
      resolveSandboxScopeKey({
        ...baseIdentity,
        lifecycle: "space",
        spaceId: "space-9",
      })
    ).toBe("space-tenant-1-space-9");
  });

  it("refuses a space lifecycle without a resolved space", () => {
    // An unresolved space claim must never fall back to a tenant-wide machine.
    expect(() =>
      resolveSandboxScopeKey({ ...baseIdentity, lifecycle: "space" })
    ).toThrow("sandbox_space_lifecycle_requires_space_binding");
  });
});
