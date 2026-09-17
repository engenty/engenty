import { describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../../plugins/test-fixtures.js";
import {
  formatMcpInventoryReport,
  inventoryMcpOperations,
  isExcludedControlPlanePath,
} from "./inventory.js";

describe("MCP operation inventory", () => {
  it("reports dispositions and keeps control-plane paths out of MCP", () => {
    const registry = makeEmptyRegistry({
      moduleOperations: [
        {
          description: "list",
          handler: async () => [],
          methodName: "contacts_list",
          operationId: "contacts_list",
          pluginConfig: {},
          pluginId: "contacts",
          source: "test",
          operation: {
            dryRunSupported: false,
            idempotent: true,
            mcpDisposition: "default",
            moduleId: "contacts",
            operationId: "contacts_list",
            requiredCapabilities: ["module.contacts.read"],
            requiresApproval: false,
            riskLevel: "low",
          },
        },
        {
          description: "list undeclared",
          handler: async () => [],
          methodName: "projects_list",
          operationId: "projects_list",
          pluginConfig: {},
          pluginId: "projects",
          source: "test",
          operation: {
            dryRunSupported: false,
            idempotent: true,
            moduleId: "projects",
            operationId: "projects_list",
            requiredCapabilities: ["module.projects.read"],
            requiresApproval: false,
            riskLevel: "low",
          },
        },
        {
          description: "impersonate",
          handler: async () => ({}),
          methodName: "core_impersonate_user",
          operationId: "core_impersonate_user",
          pluginConfig: {},
          pluginId: "core",
          source: "test",
          operation: {
            dryRunSupported: false,
            idempotent: false,
            mcpDisposition: "never",
            moduleId: "core",
            operationId: "core_impersonate_user",
            requiredCapabilities: ["core.superadmin"],
            requiresApproval: true,
            riskLevel: "critical",
          },
        },
      ],
    });
    const rows = inventoryMcpOperations(registry);
    expect(rows).toHaveLength(3);
    expect(
      rows.find((row) => row.operationId === "contacts_list")?.mcpEnabled
    ).toBe(true);
    expect(
      rows.find((row) => row.operationId === "projects_list")
        ?.declaredDisposition
    ).toBe(false);
    expect(
      rows.find((row) => row.operationId === "core_impersonate_user")
        ?.mcpEnabled
    ).toBe(false);
    expect(formatMcpInventoryReport(rows)).toContain("excluded: 1");
    expect(isExcludedControlPlanePath("/ai/chat")).toBe(true);
    expect(isExcludedControlPlanePath("/api/tools/contracts")).toBe(false);
  });
});
