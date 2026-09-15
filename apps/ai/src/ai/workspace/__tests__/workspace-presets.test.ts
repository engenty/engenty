import type { AgentWorkspaceConfig } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";

import {
  buildEngentyMountSpecs,
  expandWorkspaceMounts,
  resolveEngentyMountSpecs,
  resolveMountSpaceId,
  resolveScopeRelativePath,
  type WorkspaceScopeContext,
} from "../workspace-presets.js";

const ctx: WorkspaceScopeContext = {
  agentId: "engenty.copilot",
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

function config(partial: Partial<AgentWorkspaceConfig>): AgentWorkspaceConfig {
  return {
    enabled: true,
    preset: "custom",
    ...partial,
  } as AgentWorkspaceConfig;
}

describe("expandWorkspaceMounts", () => {
  it("expands the assistant preset with a per-user home (no read-only root)", () => {
    const mounts = expandWorkspaceMounts(config({ preset: "assistant" }));
    expect(mounts.map((m) => m.path)).toEqual([
      "/home",
      "/shared",
      "/space",
      "/skills",
      "/task",
      "/routine",
      "/project",
      "/data",
    ]);
    // The `/` read-only tenant asset mount was removed; AGENTS.md/SOUL.md reach
    // the agent via prompt injection, not a filesystem mount.
    expect(mounts.some((m) => m.path === "/")).toBe(false);
    const home = mounts.find((m) => m.path === "/home");
    expect(home?.scope).toBe("user");
    const shared = mounts.find((m) => m.path === "/shared");
    expect(shared?.scope).toBe("tenant");
    expect(shared?.access).toBe("rw");
    expect(shared?.source).toBe("commons");
  });

  it("expands the staff preset with an agent-scoped home", () => {
    const mounts = expandWorkspaceMounts(config({ preset: "staff" }));
    const home = mounts.find((m) => m.path === "/home");
    expect(home?.scope).toBe("agent");
  });

  it("prefers explicit mounts over the preset", () => {
    const mounts = expandWorkspaceMounts(
      config({
        preset: "assistant",
        mounts: [
          { access: "rw", path: "/data", scope: "tenant", source: "commons" },
        ],
      })
    );
    expect(mounts).toHaveLength(1);
  });
});

describe("resolveScopeRelativePath", () => {
  it("maps sources to tenant-relative prefixes", () => {
    expect(
      resolveScopeRelativePath(
        { access: "rw", path: "/home", scope: "user", source: "home" },
        ctx
      )
    ).toBe(`ai/workspace/users/${ctx.userId}/`);
    expect(
      resolveScopeRelativePath(
        { access: "rw", path: "/home", scope: "agent", source: "home" },
        ctx
      )
    ).toBe(`ai/workspace/agents/${ctx.agentId}/`);
    expect(
      resolveScopeRelativePath(
        { access: "rw", path: "/shared", scope: "tenant", source: "commons" },
        ctx
      )
    ).toBe("ai/workspace/commons/");
    expect(
      resolveScopeRelativePath(
        { access: "ro", path: "/skills", scope: "tenant", source: "skills" },
        ctx
      )
    ).toBe("ai/skills/");
  });

  it("returns null for an unbound task mount", () => {
    expect(
      resolveScopeRelativePath(
        {
          access: "rw",
          path: "/task",
          requireBinding: true,
          scope: "task",
          source: "checkout",
        },
        ctx
      )
    ).toBeNull();
  });

  it("resolves a task mount when bound", () => {
    expect(
      resolveScopeRelativePath(
        {
          access: "rw",
          path: "/task",
          requireBinding: true,
          scope: "task",
          source: "checkout",
        },
        { ...ctx, taskIdentifier: "ENG-142" }
      )
    ).toBe("ai/workspace/tasks/ENG-142/");
  });

  it("resolves the project mount from the containment chain, null unbound", () => {
    const projectMount = {
      access: "rw",
      path: "/project",
      requireBinding: true,
      scope: "project",
      source: "project",
    } as const;
    expect(
      resolveScopeRelativePath(projectMount, { ...ctx, projectId: "p-1" })
    ).toBe("ai/workspace/projects/p-1/");
    // Unbound chat run: the containment mounts drop rather than mount empty.
    expect(resolveScopeRelativePath(projectMount, ctx)).toBeNull();
  });
});

describe("buildEngentyMountSpecs", () => {
  it("drops unresolved task mounts and maps access to readOnly", () => {
    const mounts = expandWorkspaceMounts(config({ preset: "assistant" }));
    const specs = buildEngentyMountSpecs(mounts, ctx);
    expect(specs.map((s) => s.mountPath)).toEqual([
      "/home",
      "/shared",
      "/skills",
    ]);
    expect(specs.find((s) => s.mountPath === "/")).toBeUndefined();
    expect(specs.find((s) => s.mountPath === "/home")?.readOnly).toBe(false);
    expect(specs.find((s) => s.mountPath === "/shared")?.readOnly).toBe(false);
  });

  it("includes the task mount when a task identifier is present (assistant preset)", () => {
    const mounts = expandWorkspaceMounts(config({ preset: "assistant" }));
    const specs = buildEngentyMountSpecs(mounts, {
      ...ctx,
      taskIdentifier: "ENG-9",
    });
    expect(
      specs.find((s) => s.mountPath === "/task")?.fileStorageRelativePath
    ).toBe("ai/workspace/tasks/ENG-9/");
  });

  it("includes the /task mount for staff preset (tasks.assist) when task-bound", () => {
    // tasks.assist uses workspace: { preset: "staff" }; the harness must
    // produce a /task FileStorageFilesystem mount pointing at
    // ai/workspace/tasks/<identifier>/ when the session is checkout-bound.
    const mounts = expandWorkspaceMounts(config({ preset: "staff" }));
    const withTask = buildEngentyMountSpecs(mounts, {
      ...ctx,
      agentId: "tasks.assist",
      taskIdentifier: "ENG-142",
    });
    expect(withTask.find((s) => s.mountPath === "/task")).toEqual({
      fileStorageRelativePath: "ai/workspace/tasks/ENG-142/",
      mountPath: "/task",
      readOnly: false,
    });
    // Unbound run: /task must be absent so the workspace still assembles.
    const withoutTask = buildEngentyMountSpecs(mounts, {
      ...ctx,
      agentId: "tasks.assist",
    });
    expect(withoutTask.find((s) => s.mountPath === "/task")).toBeUndefined();
  });
});

describe("space rooting (PLAN-spaces.md Phase 2)", () => {
  const SPACE = "99999999-9999-4999-8999-999999999999";
  const runCtx: WorkspaceScopeContext = {
    ...ctx,
    runId: "run-1",
    taskIdentifier: "ENG-1",
    threadId: "thread-1",
  };

  function specsFor(overrides: Partial<WorkspaceScopeContext>) {
    return buildEngentyMountSpecs(
      expandWorkspaceMounts(config({ preset: "assistant" })),
      { ...runCtx, ...overrides }
    );
  }

  it("leaves a tenant-level run completely unchanged", () => {
    const specs = specsFor({});
    expect(specs.map((m) => m.mountPath)).toContain("/shared");
    expect(specs.map((m) => m.mountPath)).not.toContain("/space");
    expect(specs.every((m) => m.spaceId === undefined)).toBe(true);
  });

  it("roots the work mounts in the space while leaving skills and home tenant-level", () => {
    const byPath = new Map(
      specsFor({ spaceId: SPACE }).map((m) => [m.mountPath, m])
    );
    // Work containers: inside the space.
    expect(byPath.get("/task")?.spaceId).toBe(SPACE);
    // The tenant library and the personal desk: NOT inside the space.
    expect(byPath.get("/skills")?.spaceId).toBeUndefined();
    expect(byPath.get("/home")?.spaceId).toBeUndefined();
    // A space alone does not confine — the tenant commons is still mounted,
    // alongside (not instead of) the space's own.
    expect(byPath.get("/shared")?.spaceId).toBeUndefined();
    expect(byPath.get("/space")?.spaceId).toBe(SPACE);
  });

  it("drops /space entirely when the run has no space", () => {
    // Additive, not a rename: with no space there is no second commons, and
    // `/shared` is untouched.
    const paths = specsFor({}).map((m) => m.mountPath);
    expect(paths).toContain("/shared");
    expect(paths).not.toContain("/space");
  });

  it("roots a routine fire's folder on the routine, inside the space", () => {
    const byPath = new Map(
      specsFor({ routineId: "routine-7", spaceId: SPACE }).map((m) => [
        m.mountPath,
        m,
      ])
    );
    const routine = byPath.get("/routine");
    // Successive fires of one routine share this folder — that is what lets a
    // schedule keep notes between runs.
    expect(routine?.fileStorageRelativePath).toBe(
      "ai/workspace/routines/routine-7/"
    );
    expect(routine?.spaceId).toBe(SPACE);
  });

  it("drops /routine for a run that is not a routine fire", () => {
    expect(
      specsFor({ spaceId: SPACE }).find((m) => m.mountPath === "/routine")
    ).toBeUndefined();
  });

  it("gives a CONFINED agent /space in place of /shared", () => {
    const specs = specsFor({ spaceConfined: true, spaceId: SPACE });
    const paths = specs.map((m) => m.mountPath);
    expect(paths).toContain("/space");
    expect(paths).not.toContain("/shared");

    const space = specs.find((m) => m.mountPath === "/space");
    // Same relative layout as the tenant commons — only the ROOT differs.
    expect(space?.fileStorageRelativePath).toBe("ai/workspace/commons/");
    expect(space?.spaceId).toBe(SPACE);
  });

  it("ignores the confinement flag without a space rather than dropping /shared", () => {
    // Fail-open here is correct: confining to a space we cannot name would
    // leave the agent with no shared folder at all.
    const paths = specsFor({ spaceConfined: true }).map((m) => m.mountPath);
    expect(paths).toContain("/shared");
    expect(paths).not.toContain("/space");
  });

  it("roots the sandbox in the space too — a decision, not an oversight", () => {
    // A sandbox holds whatever the run pulled out of its space; leaving it at
    // the tenant root would be a hole in exactly this boundary.
    const specs = buildEngentyMountSpecs(
      expandWorkspaceMounts(config({ preset: "code_execution" })),
      { ...runCtx, spaceId: SPACE }
    );
    expect(specs.find((m) => m.mountPath === "/sandbox")?.spaceId).toBe(SPACE);
  });

  it("resolveMountSpaceId splits work from tenant library by source", () => {
    const c = { ...runCtx, spaceId: SPACE };
    const at = (source: string, scope: string) =>
      resolveMountSpaceId(
        { access: "rw", path: "/x", scope, source } as never,
        c
      );
    for (const source of ["checkout", "project", "sandbox"]) {
      expect(at(source, "task")).toBe(SPACE);
    }
    expect(at("commons", "space")).toBe(SPACE);
    expect(at("commons", "tenant")).toBeNull();
    expect(at("skills", "tenant")).toBeNull();
    expect(at("home", "user")).toBeNull();
  });
});

describe("the /data mount (PLAN-space-data.md D4)", () => {
  const base = {
    agentId: "agent-1",
    tenantId: "tenant-1",
    userId: "user-1",
  };

  it("is dropped entirely when the run has no space — there is no tree to show", () => {
    // An empty `/data` would read to the agent as "this space has no
    // contacts", which is a lie it would act on. Dropping is the fail-closed
    // answer the mount table already uses for unresolved bindings.
    const specs = buildEngentyMountSpecs(
      [{ access: "rw", path: "/data", scope: "space", source: "data" }],
      base
    );
    expect(specs).toEqual([]);
  });

  it("drops /data for an unresolved Space the same way — not an empty tree", () => {
    // Package 2 leaves spaceId unset when resolution is unresolved so this
    // mount cannot look like "the Space has no records."
    const specs = buildEngentyMountSpecs(
      [{ access: "rw", path: "/data", scope: "space", source: "data" }],
      { ...base, spaceId: undefined }
    );
    expect(specs).toEqual([]);
    expect(specs.some((spec) => spec.mountPath === "/data")).toBe(false);
  });

  it("names every drop and why, so the run can say it instead of looking empty", () => {
    const { dropped, specs } = resolveEngentyMountSpecs(
      expandWorkspaceMounts(config({ preset: "staff" })),
      { ...base, spaceId: undefined }
    );
    expect(specs.map((spec) => spec.mountPath)).toEqual(
      expect.arrayContaining(["/home", "/shared", "/skills"])
    );
    expect(specs.some((spec) => spec.mountPath === "/data")).toBe(false);
    expect(dropped).toEqual(
      expect.arrayContaining([
        { path: "/data", reason: "no_space" },
        { path: "/space", reason: "no_space" },
        { path: "/task", reason: "no_task" },
      ])
    );
    // The tenant commons a confined run loses is a drop with its own name.
    const confined = resolveEngentyMountSpecs(
      expandWorkspaceMounts(config({ preset: "staff" })),
      { ...base, spaceConfined: true, spaceId: "space-9" }
    );
    expect(confined.dropped).toContainEqual({
      path: "/shared",
      reason: "space_confined",
    });
    expect(confined.specs.some((spec) => spec.mountPath === "/space")).toBe(
      true
    );
  });

  it("is space-rooted and marked as data, not as a storage prefix", () => {
    const [spec] = buildEngentyMountSpecs(
      [{ access: "rw", path: "/data", scope: "space", source: "data" }],
      { ...base, spaceId: "space-9" }
    );
    expect(spec?.kind).toBe("data");
    expect(spec?.spaceId).toBe("space-9");
    // Writable on purpose: a file write IS the module's write operation, gate
    // included. Read-only would leave agents editing through tools and reading
    // through files — the two-representation split this design removes.
    expect(spec?.readOnly).toBe(false);
  });

  it("rides in every preset, so no archetype is blind to the space's records", () => {
    for (const preset of ["assistant", "staff", "code_execution"] as const) {
      expect(
        expandWorkspaceMounts(config({ preset })).some(
          (mount) => mount.path === "/data"
        )
      ).toBe(true);
    }
  });
});
