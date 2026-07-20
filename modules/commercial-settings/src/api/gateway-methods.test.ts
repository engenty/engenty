import type { PluginServerOperation } from "@engenty/plugin-sdk";
import { makeMockApi } from "@engenty/test-kit";
import { describe, expect, it } from "vitest";
import { registerCommercialSettingsGatewayMethods } from "./gateway-methods.js";

function getOperation(
  operations: PluginServerOperation[],
  operationId: string
) {
  const operation = operations.find(
    (candidate) => candidate.operationId === operationId
  );
  if (!operation) {
    throw new Error(`operation not found: ${operationId}`);
  }
  return operation;
}

describe("registerCommercialSettingsGatewayMethods", () => {
  it("registers commercial settings operations through the server operation API", () => {
    const { api: server, serverOperations } = makeMockApi();

    registerCommercialSettingsGatewayMethods(server, {
      get: async () => ({}),
      set: async () => ({}),
    } as any);

    expect(serverOperations.map((operation) => operation.operationId)).toEqual([
      "commercial_settings_get",
    ]);
    expect(
      getOperation(serverOperations, "commercial_settings_get")
    ).toMatchObject({
      moduleId: "commercial-settings",
      requiredCapabilities: ["module.commercial-settings.read"],
      riskLevel: "low",
      idempotent: true,
      dryRunSupported: false,
      requiresApproval: false,
    });
  });

  it("preserves the commercial settings get handler", async () => {
    const { api: server, serverOperations } = makeMockApi();

    registerCommercialSettingsGatewayMethods(server, {
      get: async () => ({ currency: "EUR" }),
      set: async () => ({}),
    } as any);

    const result = await getOperation(
      serverOperations,
      "commercial_settings_get"
    ).handler({}, {
      auth: {
        tenantId: "tenant-1",
        scopeId: "default",
        principalId: "user-1",
      },
    } as any);

    expect(result).toEqual({ currency: "EUR" });
  });
});
