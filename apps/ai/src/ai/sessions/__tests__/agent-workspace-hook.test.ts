import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngentySpaceSurface } from "../../core-http-client.js";
import { builtinPlatformSkillNames } from "../../workspace/allowed-skills.js";
import type { RunSpace, RunSpaceResolution } from "../run-space.js";
import type { AiSessionScope } from "../types.js";

const { initEngentyAgentWorkspace } = vi.hoisted(() => ({
  initEngentyAgentWorkspace: vi.fn(async (spec: unknown) => ({
    workspace: { spec },
  })),
}));

vi.mock("../../workspace/loader.js", () => ({
  initEngentyAgentWorkspace,
}));

import {
  buildAgentWorkspaceForRun,
  resolveAllowedSkillNamesForWorkspaceRun,
} from "../agent-workspace-hook.js";

const SPACE_ID = "019fe8ec-0000-0000-0000-00000000000a";

function surfaceFixture(
  overrides: Partial<EngentySpaceSurface> = {}
): EngentySpaceSurface {
  return {
    agents: ["engenty.copilot"],
    capabilities: [],
    connections: [],
    connectors: [],
    modules: [
      {
        agentAccess: "write",
        isRequired: false,
        moduleId: "projects",
        recordScope: "space",
      },
      {
        agentAccess: "none",
        isRequired: false,
        moduleId: "invoices",
        recordScope: null,
      },
    ],
    skills: ["pr-review"],
    spaceId: SPACE_ID,
    ...overrides,
  };
}

function resolvedSpace(
  surface: EngentySpaceSurface = surfaceFixture()
): RunSpace {
  const moduleIds = new Set<string>();
  const readOnlyModuleIds = new Set<string>();
  for (const mount of surface.modules) {
    if (mount.agentAccess === "none") {
      continue;
    }
    moduleIds.add(mount.moduleId);
    if (mount.agentAccess === "read") {
      readOnlyModuleIds.add(mount.moduleId);
    }
  }
  return {
    agentIds: new Set(surface.agents),
    allConnectorPrefixes: new Set(),
    browser: { autostart: false, unattended: false },
    connectorPrefixes: new Set(),
    moduleIds,
    readOnlyModuleIds,
    spaceId: surface.spaceId,
    surface,
    topLevelAgentIds: new Set(),
  };
}

function capabilityLoader(): Pick<
  DynamicAiModuleCapabilityLoader,
  "listModuleCapabilities"
> {
  return {
    listModuleCapabilities: vi.fn(async () => [
      {
        moduleId: "projects",
        skills: {
          "projects-management": "# projects",
          "projects-task-management": "# tasks",
        } as Record<string, string>,
      },
      {
        moduleId: "invoices",
        skills: {
          "invoices-search": "# invoices",
        } as Record<string, string>,
      },
    ]),
  };
}

describe("resolveAllowedSkillNamesForWorkspaceRun", () => {
  it("leaves a global run unfiltered", async () => {
    const loader = capabilityLoader();
    await expect(
      resolveAllowedSkillNamesForWorkspaceRun({
        moduleCapabilityLoader: loader,
        preferredSkillNames: ["changelog"],
        spaceResolution: { kind: "global" },
      })
    ).resolves.toBeUndefined();
    expect(loader.listModuleCapabilities).not.toHaveBeenCalled();
  });

  it("omits the filter when no Space resolution is provided (global)", async () => {
    await expect(
      resolveAllowedSkillNamesForWorkspaceRun({
        moduleCapabilityLoader: capabilityLoader(),
      })
    ).resolves.toBeUndefined();
  });

  it("returns an empty list when the Space is unresolved", async () => {
    const loader = capabilityLoader();
    const unresolved: RunSpaceResolution = {
      claimed_space_id: SPACE_ID,
      kind: "unresolved",
      reason: "not_found",
    };
    await expect(
      resolveAllowedSkillNamesForWorkspaceRun({
        moduleCapabilityLoader: loader,
        preferredSkillNames: ["changelog"],
        spaceResolution: unresolved,
      })
    ).resolves.toEqual([]);
    expect(loader.listModuleCapabilities).not.toHaveBeenCalled();
  });

  it("filters a resolved Space to explicit, mounted-module, preferred, and platform skills", async () => {
    const loader = capabilityLoader();
    const allowed = await resolveAllowedSkillNamesForWorkspaceRun({
      moduleCapabilityLoader: loader,
      preferredSkillNames: ["changelog"],
      spaceResolution: { kind: "resolved", space: resolvedSpace() },
    });
    expect(loader.listModuleCapabilities).toHaveBeenCalledTimes(1);
    expect(allowed).toEqual(
      [
        "changelog",
        "pr-review",
        "projects-management",
        "projects-task-management",
        ...builtinPlatformSkillNames(),
      ].sort((a, b) => a.localeCompare(b))
    );
    expect(allowed).not.toContain("invoices-search");
  });
});

const scope: AiSessionScope = {
  tenantId: "tenant-hook",
  userId: "user-hook",
};

const workspaceConfig = {
  enabled: true,
  preset: "custom" as const,
};

describe("buildAgentWorkspaceForRun", () => {
  beforeEach(() => {
    initEngentyAgentWorkspace.mockClear();
  });

  it("forwards the resolved allowlist onto the runtime spec", async () => {
    await buildAgentWorkspaceForRun({
      agentId: "engenty.copilot",
      moduleCapabilityLoader: capabilityLoader(),
      mounts: [
        {
          fileStorageRelativePath: "ai/skills/",
          mountPath: "/skills",
          readOnly: true,
        },
      ],
      preferredSkillNames: ["changelog"],
      runId: "run-1",
      scope,
      spaceResolution: { kind: "resolved", space: resolvedSpace() },
      threadId: "thread-1",
      workspaceConfig,
    });
    expect(initEngentyAgentWorkspace).toHaveBeenCalledTimes(1);
    const spec = initEngentyAgentWorkspace.mock.calls[0]?.[0] as {
      allowedSkillNames?: string[];
    };
    expect(spec.allowedSkillNames).toContain("projects-management");
    expect(spec.allowedSkillNames).toContain("pr-review");
    expect(spec.allowedSkillNames).toContain("changelog");
    expect(spec.allowedSkillNames).not.toContain("invoices-search");
  });

  it("forwards an empty allowlist when the Space is unresolved", async () => {
    await buildAgentWorkspaceForRun({
      agentId: "engenty.copilot",
      moduleCapabilityLoader: capabilityLoader(),
      mounts: [
        {
          fileStorageRelativePath: "ai/skills/",
          mountPath: "/skills",
          readOnly: true,
        },
      ],
      runId: "run-1",
      scope,
      spaceResolution: {
        claimed_space_id: SPACE_ID,
        kind: "unresolved",
        reason: "not_found",
      },
      threadId: "thread-1",
      workspaceConfig,
    });
    const spec = initEngentyAgentWorkspace.mock.calls[0]?.[0] as {
      allowedSkillNames?: string[];
    };
    expect(spec.allowedSkillNames).toEqual([]);
  });

  it("omits allowedSkillNames on a global run", async () => {
    await buildAgentWorkspaceForRun({
      agentId: "engenty.copilot",
      moduleCapabilityLoader: capabilityLoader(),
      mounts: [
        {
          fileStorageRelativePath: "ai/skills/",
          mountPath: "/skills",
          readOnly: true,
        },
      ],
      runId: "run-1",
      scope,
      spaceResolution: { kind: "global" },
      threadId: "thread-1",
      workspaceConfig,
    });
    const spec = initEngentyAgentWorkspace.mock.calls[0]?.[0] as {
      allowedSkillNames?: string[];
    };
    expect(spec.allowedSkillNames).toBeUndefined();
  });
});
