import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  openAiRealtimeVoiceToolsFromFrontendTools,
  resolveOpenAiRealtimeVoiceFrontendTool,
} from "./realtime-voice-frontend-tools.js";

const SAFE_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description: "Navigate the app.",
  name: "navigate",
  owner_module_id: "shell",
  parameters: { properties: {}, type: "object" },
  title: "Navigate",
});

const GATED_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description: "Delete the record.",
  name: "delete_record",
  owner_module_id: "shell",
  parameters: { properties: {}, type: "object" },
  title: "Delete record",
});

const DISABLED_TOOL = createFrontendToolDefinition({
  availability: "disabled",
  description: "Hidden tool.",
  name: "hidden_tool",
  owner_module_id: "shell",
  parameters: { properties: {}, type: "object" },
  title: "Hidden",
});

describe("openAiRealtimeVoiceToolsFromFrontendTools", () => {
  it("exposes enabled tools, skipping disabled", () => {
    const names = openAiRealtimeVoiceToolsFromFrontendTools([
      SAFE_TOOL,
      GATED_TOOL,
      DISABLED_TOOL,
    ]).map((tool) => tool.name);
    expect(names).toContain("navigate");
    expect(names).toContain("delete_record");
    expect(names).not.toContain("hidden_tool");
  });
});


describe("resolveOpenAiRealtimeVoiceFrontendTool", () => {
  it("resolves the definition from the realtime tool name", () => {
    const tool = resolveOpenAiRealtimeVoiceFrontendTool("delete_record", [
      SAFE_TOOL,
      GATED_TOOL,
    ]);
    expect(tool?.name).toBe("delete_record");
  });

  it("returns undefined for an unknown name", () => {
    expect(
      resolveOpenAiRealtimeVoiceFrontendTool("nope", [SAFE_TOOL])
    ).toBeUndefined();
  });
});
