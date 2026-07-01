import type { EngentyPluginApi } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { timeTrackingDynamicAiCapability } from "../ai/registrar.js";
import registerTimeTrackingPlugin from "./plugin.js";

function makePluginApi() {
  const captures = {
    aiRegistration: undefined as any,
  };

  const engenty = {
    server: {
      getDatabaseAdapter: () => ({}),
      registerAiRegistration: (registration: unknown) => {
        captures.aiRegistration = registration;
      },
      hasOperation: vi.fn(),
      registerHttpRoute: vi.fn(),
      registerOperation: vi.fn(),
      registerTestDataType: vi.fn(),
    },
  } as unknown as EngentyPluginApi;

  return { captures, engenty };
}

describe("registerTimeTrackingPlugin", () => {
  it("registers time-tracking AI operations and tools for agents", () => {
    const { captures, engenty } = makePluginApi();

    registerTimeTrackingPlugin(engenty);

    expect(captures.aiRegistration).toMatchObject({
      module_id: "time-tracking",
    });

    // Check that skills are registered in the registration
    expect(captures.aiRegistration.skills).toHaveLength(1);
    expect(captures.aiRegistration.skills[0].name).toBe("time-tracking");

    // Check that tools are exposed via the dynamic capability
    const capability = timeTrackingDynamicAiCapability({
      invokeTimeTrackingOperation: async () => null,
    });
    expect(capability.moduleId).toBe("time-tracking");
    expect(capability.tools).toHaveProperty("load_time_entries");
    expect(capability.tools).toHaveProperty("log_time_entry");
    expect(capability.tools).toHaveProperty("update_time_entry");
    expect(capability.tools).toHaveProperty("delete_time_entry");
  });
});
