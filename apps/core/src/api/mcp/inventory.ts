import type { PluginRegistry } from "../../plugins/registry.js";
import type { OperationContract } from "../operation-contracts.js";
import { buildOperationContracts } from "../operation-contracts.js";

export interface McpInventoryRow {
  declaredDisposition: boolean;
  disposition: string;
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
  hasSpacePolicy: boolean;
  mcpEnabled: boolean;
  moduleId: string;
  operationId: string;
  pluginId: string;
  reason?: string;
  riskLevel: string;
}

export function inventoryMcpOperations(
  registry: PluginRegistry
): McpInventoryRow[] {
  return buildOperationContracts(registry).map((contract) =>
    inventoryRow(contract)
  );
}

function inventoryRow(contract: OperationContract): McpInventoryRow {
  return {
    declaredDisposition: contract.mcp.declared,
    disposition: contract.mcp.disposition,
    hasInputSchema: contract.inputSchema.type === "zod",
    hasOutputSchema: contract.outputSchema.type === "zod",
    hasSpacePolicy: Boolean(contract.spacePolicy),
    mcpEnabled: contract.mcp.enabled,
    moduleId: contract.moduleId,
    operationId: contract.operationId,
    pluginId: contract.pluginId,
    riskLevel: contract.auth.riskLevel,
    ...(contract.mcp.enabled
      ? {}
      : { reason: `excluded:${contract.mcp.disposition}` }),
  };
}

export function formatMcpInventoryReport(rows: McpInventoryRow[]): string {
  const enabled = rows.filter((row) => row.mcpEnabled);
  const excluded = rows.filter((row) => !row.mcpEnabled);
  const undeclared = rows.filter((row) => !row.declaredDisposition);
  const lines = [
    `MCP operation inventory: ${rows.length} registered`,
    `  reachable: ${enabled.length}`,
    `  excluded: ${excluded.length}`,
    `  undeclared disposition (inferred): ${undeclared.length}`,
  ];
  for (const row of excluded) {
    lines.push(`  - ${row.operationId} ${row.reason ?? "excluded"}`);
  }
  return lines.join("\n");
}

const CONTROL_PLANE_PREFIXES = [
  "/ai/",
  "/api/queue",
  "/api/auth/service-token",
  "/api/auth/api-tokens",
  "/api/plugins/install",
];

export function isExcludedControlPlanePath(path: string): boolean {
  return CONTROL_PLANE_PREFIXES.some((prefix) => path.startsWith(prefix));
}
