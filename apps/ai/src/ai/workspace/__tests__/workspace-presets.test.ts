import type { AgentWorkspaceConfig } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";

import {
  buildEngentyMountSpecs,
  expandWorkspaceMounts,
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
      "/skills",
      "/task",
      "/goal",
      "/project",
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

  it("resolves goal/project mounts from the containment chain, null unbound", () => {
    const goalMount = {
      access: "rw",
      path: "/goal",
      requireBinding: true,
      scope: "goal",
      source: "goal",
    } as const;
    const projectMount = {
      access: "rw",
      path: "/project",
      requireBinding: true,
      scope: "project",
      source: "project",
    } as const;
    expect(resolveScopeRelativePath(goalMount, { ...ctx, goalId: "g-1" })).toBe(
      "ai/workspace/goals/g-1/"
    );
    expect(
      resolveScopeRelativePath(projectMount, { ...ctx, projectId: "p-1" })
    ).toBe("ai/workspace/projects/p-1/");
    // Unbound chat run: the containment mounts drop rather than mount empty.
    expect(resolveScopeRelativePath(goalMount, ctx)).toBeNull();
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
