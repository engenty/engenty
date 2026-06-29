import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { PluginRegistry } from "../../plugins/registry.js";
import {
  createMethodInvoker,
  MethodValidationError,
} from "../method-invoker.js";

function emptyRegistry(): PluginRegistry {
  return {
    cliRegistrars: [],
    diagnostics: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    moduleOperations: [],
    profilePolicies: [],
    resultPolicies: [],
    services: [],
    testDataTypes: [],
    queues: [],
  } as unknown as PluginRegistry;
}

describe("createMethodInvoker", () => {
  it("invokes a registered method and parses input", async () => {
    const registry = emptyRegistry();
    registry.gatewayMethods.push({
      pluginId: "test",
      source: "test",
      pluginConfig: {},
      method: {
        name: "test_echo",
        inputSchema: z.object({ x: z.string() }),
        handler: async (input) => ({ ...(input as { x: string }), y: 1 }),
      },
    });
    const invoke = createMethodInvoker({
      registry,
      config: {},
      dataDir: "",
      resolvePath: (p) => p,
    });
    await expect(invoke("test_echo", { x: "hi" })).resolves.toEqual({
      x: "hi",
      y: 1,
    });
  });

  it("throws when method is unknown", async () => {
    const invoke = createMethodInvoker({
      registry: emptyRegistry(),
      config: {},
      dataDir: "",
      resolvePath: (p) => p,
    });
    await expect(invoke("missing", {})).rejects.toThrow(
      "Unknown registered method: missing"
    );
  });

  it("throws MethodValidationError on invalid input", async () => {
    const registry = emptyRegistry();
    registry.gatewayMethods.push({
      pluginId: "test",
      source: "test",
      pluginConfig: {},
      method: {
        name: "test.strict",
        inputSchema: z.object({ n: z.number() }),
        handler: async (input) => input,
      },
    });
    const invoke = createMethodInvoker({
      registry,
      config: {},
      dataDir: "",
      resolvePath: (p) => p,
    });
    await expect(invoke("test.strict", { n: "bad" })).rejects.toSatisfy(
      (e: unknown) => e instanceof MethodValidationError
    );
  });
});
