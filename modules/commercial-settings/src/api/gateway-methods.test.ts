import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerCommercialSettingsGatewayMethods } from "./gateway-methods.js";

function makeMockApi() {
  const serverOperations: PluginServerOperation[] = [];
  const server = {
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
  } as Pick<PluginServerApi, "registerOperation">;

  return { server, serverOperations };
}

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
  it("registers a read plus one write per collection and the scalar defaults", () => {
    const { server, serverOperations } = makeMockApi();

    registerCommercialSettingsGatewayMethods(server, {
      get: async () => ({}),
      set: async () => ({}),
    } as any);

    expect(serverOperations.map((operation) => operation.operationId)).toEqual([
      "commercial_settings_get",
      "commercial_settings_disciplines_set",
      "commercial_settings_units_set",
      "commercial_settings_tax_rates_set",
      "commercial_settings_expense_categories_set",
      "commercial_settings_tax_deduction_rules_set",
      "commercial_settings_defaults_set",
      "commercial_settings_region_packs_list",
      "commercial_settings_region_pack_get",
      "commercial_settings_chart_lookup",
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
      spacePolicy: { kind: "tenant_shared" },
    });
    expect(
      serverOperations.every(
        (operation) => operation.spacePolicy?.kind === "tenant_shared"
      )
    ).toBe(true);
  });

  it("gates the money-bearing collections behind approval", () => {
    // Tax rates, expense deductibility and currency price everything written
    // afterwards; disciplines and units are catalog data.
    const { server, serverOperations } = makeMockApi();
    registerCommercialSettingsGatewayMethods(server, {
      get: async () => ({}),
      set: async () => ({}),
    } as any);

    expect(
      Object.fromEntries(
        serverOperations.map((operation) => [
          operation.operationId,
          operation.requiresApproval,
        ])
      )
    ).toEqual({
      commercial_settings_chart_lookup: false,
      commercial_settings_defaults_set: true,
      commercial_settings_disciplines_set: false,
      commercial_settings_expense_categories_set: true,
      commercial_settings_get: false,
      commercial_settings_region_pack_get: false,
      commercial_settings_region_packs_list: false,
      commercial_settings_tax_deduction_rules_set: true,
      commercial_settings_tax_rates_set: true,
      commercial_settings_units_set: false,
    });
  });

  it("writes ONLY its own collection", async () => {
    // The reason these are collection-scoped: a whole-settings write let a
    // caller that only cared about disciplines erase the tax rates.
    const writes: unknown[] = [];
    const { server, serverOperations } = makeMockApi();
    registerCommercialSettingsGatewayMethods(server, {
      get: async () => ({}),
      set: async (input: unknown) => {
        writes.push(input);
        return {};
      },
    } as any);

    await getOperation(
      serverOperations,
      "commercial_settings_disciplines_set"
    ).handler(
      { disciplines: [{ name: "UX Design", rate: 140, short: "UX" }] },
      {
        auth: { principalId: "user-1", scopeId: "default", tenantId: "t1" },
      } as any
    );

    expect(writes).toEqual([
      { disciplines: [{ name: "UX Design", rate: 140, short: "UX" }] },
    ]);
  });

  it("rejects a tax rate list with two defaults", async () => {
    const { server, serverOperations } = makeMockApi();
    registerCommercialSettingsGatewayMethods(server, {
      get: async () => ({}),
      set: async () => ({}),
    } as any);

    await expect(
      getOperation(
        serverOperations,
        "commercial_settings_tax_rates_set"
      ).handler(
        {
          tax_rates: [
            { is_default: true, label: "A", name: "a", value: 10 },
            { is_default: true, label: "B", name: "b", value: 20 },
          ],
        },
        {
          auth: { principalId: "user-1", scopeId: "default", tenantId: "t1" },
        } as any
      )
    ).rejects.toThrow();
  });

  it("preserves the commercial settings get handler", async () => {
    const { server, serverOperations } = makeMockApi();

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

  it("lists region packs without touching the repo", async () => {
    const { server, serverOperations } = makeMockApi();
    registerCommercialSettingsGatewayMethods(server, {
      get: async () => {
        throw new Error("should not read settings");
      },
      set: async () => {
        throw new Error("should not write settings");
      },
    } as any);

    const result = (await getOperation(
      serverOperations,
      "commercial_settings_region_packs_list"
    ).handler({}, {
      auth: {
        tenantId: "tenant-1",
        scopeId: "default",
        principalId: "user-1",
      },
    } as any)) as {
      packs: Array<{ region: string; expense_class: string | null }>;
    };

    expect(result.packs.map((pack) => pack.region)).toEqual([
      "AT",
      "CH",
      "DE",
      "GB",
    ]);
    expect(
      result.packs.find((pack) => pack.region === "AT")?.expense_class
    ).toBe("7");
  });
});
