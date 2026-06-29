import { describe, expect, it } from "vitest";

import {
  defaultTenantSkillPaths,
  mapRegistryRowToWorkspaceAgentConfig,
  parseEngentyWorkspaceRuntimeSpec,
} from "../contracts.js";
import { createEngentyAgentWorkspace } from "../loader.js";
import {
  createWorkspaceAgentRecordSource,
  WorkspaceBackedAgentRegistry,
} from "../workspace-agent-registry.js";

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
      basePath: "/tmp/engenty-workspace-test",
    });

    const { skillDiscoveryPaths, workspace } =
      await createEngentyAgentWorkspace(spec);
    expect(workspace).toBeDefined();
    expect(skillDiscoveryPaths).toContain("skills");
    expect(skillDiscoveryPaths).toContain("skills/demo");
  });
});

describe("WorkspaceBackedAgentRegistry", () => {
  it("lists workspace agent configs without inline skills", async () => {
    const source = createWorkspaceAgentRecordSource(
      async () => null,
      async () => [
        {
          agent_id: "a1",
          instructions: "Do work",
          model: "openai/gpt-4.1-mini",
          name: "A1",
          skill_ids: ["s1"],
          sub_agents: [],
          tenant_id: "tenant-1",
          tool_ids: [],
        },
      ]
    );
    const registry = new WorkspaceBackedAgentRegistry(source, "tenant-1");
    const configs = await registry.listAgentConfigs();

    expect(configs).toHaveLength(1);
    expect(configs[0]?.skillIds).toEqual(["skills/s1"]);
  });
});
