import { describe, expect, it } from "vitest";

import {
  defaultTenantSkillPaths,
  mapRegistryRowToWorkspaceAgentConfig,
  parseEngentyWorkspaceRuntimeSpec,
} from "../contracts.js";
import { createEngentyAgentWorkspace } from "../loader.js";

describe("engenty workspace contracts", () => {
  it("maps registry rows to skill path config", () => {
    const config = mapRegistryRowToWorkspaceAgentConfig({
      agent_id: "tenant_copilot",
      description: "Copilot",
      instructions: "You are helpful.",
      model: "openai/gpt-4.1-mini",
      name: "Copilot",
      skill_ids: ["search", "draft"],
      sub_agents: [{ id: "engenty_tools", alias: "tools" }],
      tenant_id: "tenant-1",
      tool_ids: ["engenty_tools_search"],
    });

    expect(config.skillPaths).toEqual(["skills/search", "skills/draft"]);
    expect(config.subAgents).toEqual([{ id: "engenty_tools", alias: "tools" }]);
  });

  it("builds default tenant skill paths", () => {
    expect(defaultTenantSkillPaths("abc")).toEqual([
      "tenants/abc/ai/skills",
      "tenants/abc/ai/workspace/skills",
    ]);
  });
});

describe("createEngentyAgentWorkspace", () => {
  it("returns a workspace with skill discovery paths", async () => {
    const spec = parseEngentyWorkspaceRuntimeSpec({
      agentConfig: {
        id: "demo",
        instructions: "",
        model: "openai/gpt-4.1-mini",
        name: "Demo",
        skillPaths: ["skills/demo"],
        tenantId: "tenant-1",
      },
      mounts: [
        {
          fileStorageRelativePath: "ai/workspace/users/user-1/",
          mountPath: "/home",
        },
      ],
    });

    const { skillDiscoveryPaths, workspace } =
      await createEngentyAgentWorkspace(spec);
    expect(workspace).toBeDefined();
    expect(skillDiscoveryPaths).toContain("skills");
    expect(skillDiscoveryPaths).toContain("skills/demo");
  });

  // The mount table IS the workspace. Zero mounts used to silently fall back to
  // one unscoped filesystem — a broader view than the declaration granted.
  it("refuses to build a workspace with no mounts", async () => {
    const spec = parseEngentyWorkspaceRuntimeSpec({
      agentConfig: {
        id: "demo",
        instructions: "",
        model: "openai/gpt-4.1-mini",
        name: "Demo",
        tenantId: "tenant-1",
      },
      mounts: [],
    });

    await expect(createEngentyAgentWorkspace(spec)).rejects.toThrow(
      /resolved zero mounts/
    );
  });
});
