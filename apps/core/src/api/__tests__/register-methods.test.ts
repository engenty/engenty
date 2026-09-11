import {
  CHAT_THREAD_INDEX_HEALTH_METHOD,
  CHAT_THREAD_SEARCH_METHOD,
  ENGENTY_API_CATALOG_TOOL_ID,
} from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import type { PluginRegistry } from "../../plugins/registry.js";
import { registerCoreMethods } from "../register-methods.js";

function minimalRegistry(): PluginRegistry {
  return {
    gatewayMethods: [],
    moduleOperations: [],
  } as unknown as PluginRegistry;
}

describe("registerCoreMethods", () => {
  it("registers the core plugin methods", () => {
    const registry = minimalRegistry();
    registerCoreMethods(
      registry,
      {},
      {
        getApiCatalog: () => ({ matches: [], total: 0 }),
      }
    );
    const names = registry.gatewayMethods.map((e) => e.method.name).sort();
    expect(names).toEqual(
      [
        "core_users_create_in_tenant",
        "core_agents_ensure",
        ENGENTY_API_CATALOG_TOOL_ID,
        CHAT_THREAD_INDEX_HEALTH_METHOD,
        CHAT_THREAD_SEARCH_METHOD,
      ].sort()
    );
    expect(registry.gatewayMethods.every((e) => e.pluginId === "core")).toBe(
      true
    );
    // Only the methods carrying `operation` metadata reach moduleOperations —
    // the two chat-thread methods deliberately do not.
    expect(registry.moduleOperations.map((e) => e.operationId).sort()).toEqual(
      [
        "core_agents_ensure",
        "core_users_create_in_tenant",
        ENGENTY_API_CATALOG_TOOL_ID,
      ].sort()
    );
    expect(registry.moduleOperations.every((e) => e.pluginId === "core")).toBe(
      true
    );
  });

  it("does not duplicate when called twice", () => {
    const registry = minimalRegistry();
    const helpers = {
      getApiCatalog: () => ({ matches: [], total: 0 }),
    };
    registerCoreMethods(registry, {}, helpers);
    const n = registry.gatewayMethods.length;
    registerCoreMethods(registry, {}, helpers);
    expect(registry.gatewayMethods.length).toBe(n);
  });

  it("adds missing operation metadata when a core gateway already exists", () => {
    const registry = minimalRegistry();
    registry.gatewayMethods.push({
      pluginId: "core",
      method: {
        name: "core_users_create_in_tenant",
        handler: async () => null,
      },
      source: "core",
      pluginConfig: {},
    });

    registerCoreMethods(
      registry,
      {},
      {
        getApiCatalog: () => ({ matches: [], total: 0 }),
      }
    );

    expect(
      registry.gatewayMethods.filter(
        (entry) => entry.method.name === "core_users_create_in_tenant"
      )
    ).toHaveLength(1);
    expect(
      registry.moduleOperations.some(
        (entry) => entry.operationId === "core_users_create_in_tenant"
      )
    ).toBe(true);
  });
});
