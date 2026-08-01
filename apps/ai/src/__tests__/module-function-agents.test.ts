import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentFnDescriptor,
  defineModuleAi,
  useSkillHint,
} from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import { createDefaultAiRegistry } from "../ai/agents.js";

// Phase 4: a module ships a hook-composed agent via defineModuleAi's
// agentFns channel; it rides the capability loader into the function
// provider and replaces a scanned agent.json config of the same id.

const moduleAgent: AgentFnDescriptor = {
  description: "Function twin",
  fn: () => {
    useSkillHint("from-function");
    return "From agent.ts.";
  },
  id: "demo.helper",
  name: "Helper (fn)",
};

function scaffoldModuleAiDir(): string {
  // Minimal ai/ tree: one agent dir with agent.json + AGENTS.md whose id
  // collides with the function agent above.
  const dir = mkdtempSync(join(tmpdir(), "module-fn-agents-"));
  const agentDir = join(dir, "agents", "demo.helper");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(agentDir, "agent.json"),
    JSON.stringify({
      $schema: "engenty/ai-agent-manifest/v1",
      description: "JSON twin",
      id: "demo.helper",
      module_id: "demo",
      name: "Helper (json)",
      tools: [],
    })
  );
  writeFileSync(join(agentDir, "AGENTS.md"), "From agent.json.");
  return dir;
}

describe("module function agents (defineModuleAi agentFns)", () => {
  it("carries agentFns in the dynamic capability and drops the json twin", () => {
    const moduleAi = defineModuleAi({
      agentFns: [moduleAgent],
      dir: scaffoldModuleAiDir(),
      moduleId: "demo",
    });
    const capability = moduleAi.dynamicCapability();
    expect(capability.agentFns?.map((d) => d.id)).toEqual(["demo.helper"]);
    // The scanned agent.json config of the same id is replaced (D7).
    expect(
      capability.agentConfigs?.some((config) => config.id === "demo.helper")
    ).toBe(false);
  });

  it("resolves the module function agent through the default registry", async () => {
    const moduleAi = defineModuleAi({
      agentFns: [moduleAgent],
      dir: scaffoldModuleAiDir(),
      moduleId: "demo",
    });
    const registry = createDefaultAiRegistry({
      moduleLoader: {
        listModuleCapabilities: async () => [moduleAi.dynamicCapability()],
      },
    });
    const config = await registry.getAgentConfig("demo.helper");
    expect(config?.instructions).toBe("From agent.ts.");
    expect(config?.skillIds).toEqual(["from-function"]);
    expect(config?.name).toBe("Helper (fn)");
  });
});
