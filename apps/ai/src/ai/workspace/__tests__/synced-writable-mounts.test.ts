import { describe, expect, it } from "vitest";

import { buildSyncedWritableMounts } from "../loader.js";
import { resolveLocalMountBasePath } from "../local-workspace-paths.js";

const tenantId = "tenant-1";

// Assistant-style table: read-only `/skills`, writable `/home` + `/shared`,
// and the writable-but-checkout `/task`.
const mounts = [
  { fileStorageRelativePath: "ai/workspace/users/user-1/", mountPath: "/home" },
  { fileStorageRelativePath: "ai/workspace/commons/", mountPath: "/shared" },
  {
    fileStorageRelativePath: "ai/skills/",
    mountPath: "/skills",
    readOnly: true,
  },
  { fileStorageRelativePath: "ai/workspace/tasks/ENG-1/", mountPath: "/task" },
];

describe("buildSyncedWritableMounts", () => {
  it("stages + binds + syncs /home and /shared with their own prefixes", () => {
    const { extraMounts, stagingByMountPath } = buildSyncedWritableMounts(
      mounts,
      tenantId
    );

    // Only the writable durable mounts (home + commons) are unified.
    expect(extraMounts).toEqual([
      {
        containerPath: "/home",
        layout: {
          fileStorageRelativePath: "ai/workspace/users/user-1/",
          stagingPath: resolveLocalMountBasePath(
            tenantId,
            "ai/workspace/users/user-1/"
          ),
        },
      },
      {
        containerPath: "/shared",
        layout: {
          fileStorageRelativePath: "ai/workspace/commons/",
          stagingPath: resolveLocalMountBasePath(
            tenantId,
            "ai/workspace/commons/"
          ),
        },
      },
    ]);
    expect([...stagingByMountPath.keys()]).toEqual(["/home", "/shared"]);
  });

  it("excludes read-only mounts and the /task checkout", () => {
    const { stagingByMountPath } = buildSyncedWritableMounts(mounts, tenantId);
    expect(stagingByMountPath.has("/skills")).toBe(false);
    expect(stagingByMountPath.has("/task")).toBe(false);
  });

  it("derives the home staging path from the mount spec (per-agent prefix)", () => {
    // Staff agents use an agent-scoped home prefix — driven by the spec, not hardcoded.
    const agentMounts = [
      {
        fileStorageRelativePath: "ai/workspace/agents/staff-agent/",
        mountPath: "/home",
      },
    ];
    const { stagingByMountPath } = buildSyncedWritableMounts(
      agentMounts,
      tenantId
    );
    expect(stagingByMountPath.get("/home")).toBe(
      resolveLocalMountBasePath(tenantId, "ai/workspace/agents/staff-agent/")
    );
  });
});

describe("space-rooted synced mounts", () => {
  const SPACE_A = "space-a";
  const SPACE_B = "space-b";
  const spaceCommons = (spaceId: string) => ({
    fileStorageRelativePath: "ai/workspace/commons/",
    mountPath: "/space",
    spaceId,
  });

  it("carries the space into the sync layout so bytes land in the right prefix", () => {
    const { extraMounts } = buildSyncedWritableMounts(
      [spaceCommons(SPACE_A)],
      tenantId
    );
    expect(extraMounts).toEqual([
      {
        containerPath: "/space",
        layout: {
          fileStorageRelativePath: "ai/workspace/commons/",
          spaceId: SPACE_A,
          stagingPath: resolveLocalMountBasePath(
            tenantId,
            "ai/workspace/commons/",
            SPACE_A
          ),
        },
      },
    ]);
  });

  it("stages two spaces' commons in DIFFERENT local dirs", () => {
    // Both have the identical relative path, so a staging path that ignored the
    // space would put them in one directory and let the sandbox sync one
    // space's files out into the other's storage prefix.
    const a = buildSyncedWritableMounts([spaceCommons(SPACE_A)], tenantId);
    const b = buildSyncedWritableMounts([spaceCommons(SPACE_B)], tenantId);
    const pathA = a.stagingByMountPath.get("/space");
    const pathB = b.stagingByMountPath.get("/space");
    expect(pathA).toBeTruthy();
    expect(pathA).not.toBe(pathB);
  });

  it("keeps the tenant commons staging path unchanged", () => {
    // Segment check, not substring: the base temp dir is `engenty-workspaces`,
    // which contains "spaces" and would make a naive assertion pass for the
    // wrong reason.
    const tenantPath = resolveLocalMountBasePath(
      tenantId,
      "ai/workspace/commons/"
    );
    expect(tenantPath.split("/")).not.toContain("spaces");
    expect(tenantPath.endsWith("tenants/tenant-1/ai/workspace/commons")).toBe(
      true
    );
    expect(
      resolveLocalMountBasePath(
        tenantId,
        "ai/workspace/commons/",
        SPACE_A
      ).split("/")
    ).toContain("spaces");
  });
});
