import { describe, expect, it } from "vitest";
import {
  createKbManagerAgent,
  readKbManagerAgentsMarkdown,
} from "../kb-manager-agent.js";

describe("createKbManagerAgent", () => {
  it("links AGENTS.md instruction catalog keys", () => {
    const agent = createKbManagerAgent();
    expect(agent.instruction_keys).toEqual(["knowledge_base_manager_agents"]);
    expect(readKbManagerAgentsMarkdown().trim().length).toBeGreaterThan(100);
  });

  it("uses catalog-backed tools instead of KB-native wrappers", () => {
    const agent = createKbManagerAgent();
    const tools = agent.build_tools?.({
      action: "direct",
      agentId: agent.id,
      callGatewayMethod: async () => ({}),
      moduleId: "knowledge-base",
      scope: {},
      scopeId: "default",
      tenantId: "t1",
    });
    expect(tools).toBeDefined();
    expect(Object.keys(tools ?? {}).sort()).toEqual(
      ["engentyApiCatalog", "web_search"].sort()
    );
  });
});
