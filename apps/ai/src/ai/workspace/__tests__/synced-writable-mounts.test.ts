import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildSyncedWritableMounts } from "../loader.js";
import {
  resolveEngentyHostRoot,
  resolveLocalMountBasePath,
} from "../local-workspace-paths.js";

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
    // Segments below the root, not a substring: the root itself is the
    // spaces dir, which would make a naive assertion pass for the wrong reason.
    const below = (p: string) =>
      path.relative(resolveEngentyHostRoot(), p).split(path.sep);
    const tenantPath = resolveLocalMountBasePath(
      tenantId,
      "ai/workspace/commons/"
    );
    expect(below(tenantPath)).toEqual([
      "tenants",
      "tenant-1",
      "ai",
      "workspace",
      "commons",
    ]);
    expect(
      below(
        resolveLocalMountBasePath(tenantId, "ai/workspace/commons/", SPACE_A)
      )
    ).toContain("spaces");
  });
});

describe("space computer binds", () => {
  // Staff table for one agent in a Space: its own `/home`, the tenant and
  // space commons.
  const staffTable = (agentId: string) => [
    {
      fileStorageRelativePath: `ai/workspace/agents/${agentId}/`,
      mountPath: "/home",
    },
    { fileStorageRelativePath: "ai/workspace/commons/", mountPath: "/shared" },
    {
      fileStorageRelativePath: "ai/workspace/commons/",
      mountPath: "/space",
      spaceId: "space-a",
    },
  ];

  it("binds the same sources whichever agent creates the container", () => {
    // Docker fixes a container's binds at creation, so a bind that differed
    // per agent would hand every later agent the first one's `/home`.
    const a = buildSyncedWritableMounts(
      staffTable("agent-a"),
      tenantId,
      "space"
    );
    const b = buildSyncedWritableMounts(
      staffTable("agent-b"),
      tenantId,
      "space"
    );
    expect(a.extraMounts).toEqual(b.extraMounts);
    expect(a.extraMounts.map((mount) => mount.containerPath)).not.toContain(
      "/home"
    );
    // Not staged either, so file tools reach the agent's own `/home` in
    // storage rather than a local dir the provider never syncs.
    expect(a.stagingByMountPath.has("/home")).toBe(false);
  });
});
