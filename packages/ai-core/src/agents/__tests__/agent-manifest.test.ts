import { describe, expect, it } from "vitest";
import { copilotAgentAssetLocator } from "../../instructions/copilot-seed-files.js";
import {
  aiAgentManifestSchema,
  loadAgentManifest,
  readAgentTextAsset,
  resolveAgentAssetDir,
} from "../agent-manifest.js";
import { GENERAL_CHAT_AGENT_ID } from "../copilot-constants.js";

describe("agent-manifest helpers", () => {
  it("resolve copilot asset directory and loads manifest files", () => {
    const manifest = loadAgentManifest(copilotAgentAssetLocator);
    const agentInstructions = readAgentTextAsset(
      copilotAgentAssetLocator,
      "AGENTS.md"
    );

    expect(resolveAgentAssetDir(copilotAgentAssetLocator)).toContain(
      "engenty.copilot"
    );
    expect(manifest.id).toBe(GENERAL_CHAT_AGENT_ID);
    expect(agentInstructions).toContain("You are engenty");
    expect(agentInstructions).toContain("in-app AI **copilot**");
    expect(manifest.instruction_files).toEqual([
      "AGENTS.md",
      "SOUL.md",
      "SKILLS.md",
    ]);
  });
});

describe("aiAgentManifestSchema", () => {
  it("accepts minimal valid v1 document", () => {
    const parsed = aiAgentManifestSchema.parse({
      $schema: "engenty/ai-agent-manifest/v1",
      description: "d",
      id: "x_y",
      instruction_keys: [],
      module_id: "engenty",
      name: "N",
      skills: [],
      tools: ["engentyApiCatalog"],
    });

    expect(parsed.id).toBe("x_y");
    expect(parsed.agent_scope).toBeUndefined();
  });

  it("carries agent_scope for specialists that have an audience", () => {
    const parsed = aiAgentManifestSchema.parse({
      $schema: "engenty/ai-agent-manifest/v1",
      agent_scope: "shared",
      description: "d",
      id: "x_y",
      module_id: "engenty",
      name: "N",
      skills: [],
      tools: [],
    });
    expect(parsed.agent_scope).toBe("shared");
    expect(() =>
      aiAgentManifestSchema.parse({
        $schema: "engenty/ai-agent-manifest/v1",
        agent_scope: "team",
        description: "d",
        id: "x_y",
        module_id: "engenty",
        name: "N",
        skills: [],
        tools: [],
      })
    ).toThrow();
  });
});
