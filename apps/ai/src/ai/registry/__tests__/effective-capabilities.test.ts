import { describe, expect, it } from "vitest";
import { LIVE_HIRE_TOOL_IDS } from "../../../../ai/tools/agent-hire-policy.js";
import { withNativeModuleToolMeta } from "../../native-module-tool-meta.js";
import type { RunSpaceResolution } from "../../sessions/run-space.js";
import { resolveEffectiveCapabilities } from "../effective-capabilities.js";
import type { AgentConfig, MastraToolDefinition } from "../types.js";

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "helper",
    instructions: "help",
    model: "m",
    name: "Helper",
    skillIds: [],
    source: "database",
    toolIds: [],
    ...overrides,
  } as AgentConfig;
}

function resolved(overrides: {
  skills?: string[];
  topLevel?: string[];
  moduleIds?: string[];
}): RunSpaceResolution {
  return {
    kind: "resolved",
    space: {
      agentIds: new Set(["helper"]),
      allConnectorPrefixes: new Set(),
      browser: null,
      connectionIds: new Set(),
      connectorPrefixes: new Set(),
      moduleIds: new Set(overrides.moduleIds ?? []),
      readOnlyModuleIds: new Set(),
      spaceId: "space-1",
      surface: { skills: overrides.skills ?? [] },
      topLevelAgentIds: new Set(overrides.topLevel ?? []),
    },
  } as unknown as RunSpaceResolution;
}

describe("resolveEffectiveCapabilities", () => {
  it("lays a hired specialist's set out by layer", async () => {
    const result = await resolveEffectiveCapabilities({
      config: agent({ skillIds: ["inbox-triage"], toolIds: ["web_search"] }),
    });
    expect(result.carries_floor).toBe(true);
    expect(result.tools.default).toEqual([...LIVE_HIRE_TOOL_IDS]);
    // Declared but already on the floor is the floor, not the agent's own.
    expect(result.tools.agent).toEqual([]);
    expect(result.tools.attached).toEqual(
      expect.arrayContaining(["show_objects", "engenty_tools_preapprove"])
    );
    expect(result.tools.space_hidden).toBeNull();
    expect(result.skills.default).toContain("space-data");
    expect(result.skills.agent).toEqual(["inbox-triage"]);
    expect(result.skills.space).toBeNull();
    expect(result.top_level).toBe(false);
  });

  it("gives an interface agent exactly what it declares", async () => {
    const result = await resolveEffectiveCapabilities({
      config: agent({
        id: "engenty.remote",
        kind: "interface",
        source: "module",
        toolIds: ["engenty_tools_search"],
      }),
    });
    expect(result.carries_floor).toBe(false);
    expect(result.tools.default).toEqual([]);
    expect(result.tools.agent).toEqual(["engenty_tools_search"]);
    expect(result.tools.attached).toEqual([]);
    expect(result.skills.default).toEqual([]);
  });

  it("adds the lead's hire set and the Space's skills when the Space says so", async () => {
    const result = await resolveEffectiveCapabilities({
      config: agent(),
      spaceId: "space-1",
      spaceResolution: resolved({
        skills: ["marketing-brief"],
        topLevel: ["helper"],
      }),
    });
    expect(result.top_level).toBe(true);
    expect(result.tools.default).toContain("agent_propose");
    expect(result.skills.default).toContain("chief-of-staff");
    expect(result.skills.space).toEqual(["marketing-brief"]);
    expect(result.space_id).toBe("space-1");
  });

  it("names the module tools the Space hides", async () => {
    const contactsTool = withNativeModuleToolMeta(
      {
        description: "x",
        id: "contacts_list",
      } as unknown as MastraToolDefinition,
      { moduleId: "contacts", operationId: "contacts_list", readOnly: true }
    );
    const result = await resolveEffectiveCapabilities({
      config: agent({ toolIds: ["contacts_list"] }),
      registry: {
        getTool: async (id: string) =>
          id === "contacts_list" ? contactsTool : undefined,
      },
      spaceResolution: resolved({ moduleIds: ["tasks"] }),
    });
    expect(result.tools.agent).toEqual(["contacts_list"]);
    expect(result.tools.space_hidden).toEqual(["contacts_list"]);
  });
});
