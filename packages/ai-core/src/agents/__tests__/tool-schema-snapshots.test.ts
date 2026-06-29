import { tool } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  registerAiRegistration,
  unregisterAiRegistration,
} from "../../registry.js";
import { listAgentToolSchemaSnapshots } from "../tool-schema-snapshots.js";

const moduleId = "tool-schema-snapshots-test";

describe("listAgentToolSchemaSnapshots", () => {
  afterEach(() => {
    unregisterAiRegistration(moduleId);
  });

  it("returns JSON Schema for Zod inputSchema and filters by allow list", () => {
    registerAiRegistration({
      module_id: moduleId,
      agents: [
        {
          build_system_prompt: () => "x",
          build_tools: () => ({
            alpha: tool({
              description: "Alpha does things",
              inputSchema: z.object({ count: z.number().int() }),
              execute: async () => ({}),
            }) as object,
            beta: tool({
              description: "Beta",
              inputSchema: z.object({ q: z.string() }),
              execute: async () => ({}),
            }) as object,
          }),
          id: `${moduleId}.agent`,
          instruction_keys: [],
          module_id: moduleId,
          name: "Schema test agent",
        },
      ],
    });

    const all = listAgentToolSchemaSnapshots({
      agentId: `${moduleId}.agent`,
    });
    expect(all).toHaveLength(2);

    const filtered = listAgentToolSchemaSnapshots({
      agentId: `${moduleId}.agent`,
      allowedToolNames: ["alpha"],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered?.[0]?.tool_id).toBe("alpha");
    expect(filtered?.[0]?.description).toBe("Alpha does things");
    expect(filtered?.[0]?.input_schema_json?.properties).toMatchObject({
      count: expect.objectContaining({ type: "integer" }),
    });
    expect(filtered?.[0]?.output_schema_json).toBeNull();
  });

  it("returns null for unknown agent", () => {
    expect(
      listAgentToolSchemaSnapshots({ agentId: "missing.agent" })
    ).toBeNull();
  });
});
