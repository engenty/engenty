import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineModuleAi } from "../define-module-ai.js";
import {
  listModuleDynamicCapabilitySeeds,
  listRegisteredOutcomeProviders,
  registerAiRegistration,
  unregisterAiRegistration,
} from "../registry.js";

const tempDirs: string[] = [];

afterEach(() => {
  unregisterAiRegistration("demo");
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("outcome provider registration", () => {
  it("rides AiRegistration and the capability seed channel", () => {
    registerAiRegistration({
      module_id: "demo",
      outcome_providers: [
        {
          configSchema: {
            properties: { url: { type: "string" } },
            required: ["url"],
            type: "object",
          },
          description: "Post to WhatsApp",
          id: "remote.whatsapp",
          label: "WhatsApp",
          moduleId: "demo",
          operationId: "remote_enqueue_outbound",
          payloadSchema: { type: "object" },
        },
      ],
    });
    expect(listRegisteredOutcomeProviders().map((p) => p.id)).toEqual([
      "remote.whatsapp",
    ]);
    const seed = listModuleDynamicCapabilitySeeds().find(
      (item) => item.moduleId === "demo"
    );
    expect(seed?.outcomeProviders?.[0]?.operationId).toBe(
      "remote_enqueue_outbound"
    );
    expect(() => JSON.stringify(seed)).not.toThrow();
  });

  it("defineModuleAi passes outcomeProviders onto both payloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "module-ai-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, "agents", "demo.manager"), { recursive: true });
    writeFileSync(
      join(dir, "agents", "demo.manager", "agent.json"),
      JSON.stringify({
        $schema: "engenty/ai-agent-manifest/v1",
        description: "Demo",
        id: "demo.manager",
        module_id: "demo",
        name: "Demo Manager",
        skills: [],
        tools: [],
      })
    );
    writeFileSync(join(dir, "agents", "demo.manager", "AGENTS.md"), "You are.");
    const provider = {
      configSchema: { type: "object" },
      description: "A plugin destination",
      id: "demo.channel",
      label: "Demo channel",
      moduleId: "demo",
      operationId: "demo_deliver",
      payloadSchema: { type: "object" },
    };
    const moduleAi = defineModuleAi({
      dir,
      moduleId: "demo",
      outcomeProviders: [provider],
    });
    expect(moduleAi.aiRegistration().outcome_providers).toEqual([provider]);
    expect(moduleAi.dynamicCapability().outcomeProviders).toEqual([provider]);
  });
});
