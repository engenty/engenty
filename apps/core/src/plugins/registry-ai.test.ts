import {
  listActiveAiRegistrations,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { afterEach, describe, expect, it } from "vitest";
import { createPluginRegistry, type PluginRecord } from "./registry";

function createRecord(id: string): PluginRecord {
  return {
    id,
    source: `/plugins/${id}.ts`,
    cliCommands: [],
    dependencies: [],
    enabled: true,
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    loaded: true,
    manifestPath: `/plugins/${id}/engenty.plugin.json`,
    moduleOperations: [],
    queues: [],
    rootDir: `/plugins/${id}`,
    services: [],
    testDataTypes: [],
  };
}

describe("createPluginRegistry AI helpers", () => {
  afterEach(() => {
    unregisterAiRegistration("ai-plugin-test");
  });

  it("lets plugins register orchestrator AI registrations", () => {
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    const record = createRecord("ai-plugin-test");
    registry.plugins.push(record);
    const api = createApi(record, {});

    api.server.registerAiRegistration({
      module_id: "ai-plugin-test",
      agents: [
        {
          id: "ai_plugin_test_agent",
          module_id: "ai-plugin-test",
          name: "AI Plugin Test Agent",
          instruction_keys: [],
          build_tools: () => ({}),
        },
      ],
      actions: [],
      instruction_documents: [],
      skills: [],
      triggers: [
        {
          id: "ai_plugin_test_trigger",
          moduleId: "ai-plugin-test",
          routeKey: "chat",
          triggerType: "button",
        },
      ],
    });

    expect(
      listActiveAiRegistrations().some(
        (registration) => registration.module_id === "ai-plugin-test"
      )
    ).toBe(true);
  });
});
