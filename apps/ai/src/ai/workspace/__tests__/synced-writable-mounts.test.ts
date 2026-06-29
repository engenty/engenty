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
