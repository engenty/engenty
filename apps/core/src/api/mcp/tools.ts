import { CATALOG_TOOL_IDS } from "@engenty/mcp-server";
import { capabilityCovers } from "@engenty/plugin-sdk";
import type { PrincipalContext } from "../../security/auth.js";
import type { OperationContract } from "../operation-contracts.js";

export const MCP_LIST_PAGE_SIZE = 50;
export const MCP_SCHEMA_MAX_DEPTH = 12;
export const MCP_RESULT_MAX_BYTES = 262_144;
const RISK_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;

export interface McpToolProjection {
  annotations?: {
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    readOnlyHint?: boolean;
  };
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
  outputSchema?: Record<string, unknown>;
  resourceUri?: string;
}

export function isReadOnlyContract(contract: OperationContract): boolean {
  return contract.readOnly;
}

export function contractReachableOnMcp(
  contract: OperationContract,
  principal: PrincipalContext
): boolean {
  if (!contract.mcp.enabled) {
    return false;
  }
  if (
    principal.maxRiskLevel &&
    RISK_RANK[contract.auth.riskLevel] > RISK_RANK[principal.maxRiskLevel]
  ) {
    return false;
  }
  if (
    principal.moduleIds.length > 0 &&
    !principal.moduleIds.includes(contract.moduleId)
  ) {
    return false;
  }
  if (
    !contract.auth.requiredCapabilities.every((required) =>
      capabilityCovers(principal.capabilities, required)
    )
  ) {
    return false;
  }
  return true;
}

export function catalogExecuteAllowed(
  contract: OperationContract,
  principal: PrincipalContext
): boolean {
  return (
    contractReachableOnMcp(contract, principal) &&
    contract.mcp.disposition === "default"
  );
}

export function directToolAllowed(
  contract: OperationContract,
  principal: PrincipalContext
): boolean {
  if (!contractReachableOnMcp(contract, principal)) {
    return false;
  }
  return (
    contract.mcp.disposition === "default" ||
    contract.mcp.disposition === "explicit_grant"
  );
}

export function projectDirectTools(
  contracts: OperationContract[],
  principal: PrincipalContext
): McpToolProjection[] {
  return contracts
    .filter((contract) => directToolAllowed(contract, principal))
    .map(projectContractTool)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function paginateTools<T>(
  items: T[],
  cursor?: string
): { items: T[]; nextCursor?: string } {
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const slice = items.slice(start, start + MCP_LIST_PAGE_SIZE);
  const next = start + slice.length;
  return {
    items: slice,
    ...(next < items.length ? { nextCursor: String(next) } : {}),
  };
}

export function projectContractTool(
  contract: OperationContract
): McpToolProjection {
  const inputSchema = boundJsonSchema(
    contract.inputSchema.jsonSchema ?? { type: "object" }
  );
  const outputSchema = contract.outputSchema.jsonSchema
    ? boundJsonSchema(contract.outputSchema.jsonSchema)
    : undefined;
  return {
    name: contract.operationId,
    description:
      contract.description ??
      contract.summary ??
      `${contract.moduleId} operation`,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    annotations: contract.mcp.annotations ?? {
      readOnlyHint: contract.readOnly,
      idempotentHint: contract.readOnly,
      destructiveHint: !contract.readOnly,
    },
    ...(contract.mcp.appResourceUri
      ? { resourceUri: contract.mcp.appResourceUri }
      : {}),
  };
}

export function catalogToolNames(): string[] {
  return Object.values(CATALOG_TOOL_IDS);
}

export function boundJsonSchema(
  schema: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  if (depth >= MCP_SCHEMA_MAX_DEPTH) {
    return { type: "object" };
  }
  if (schema.$ref) {
    return { type: "object", description: "Ref flattened for MCP bounds" };
  }
  const next: Record<string, unknown> = { ...schema };
  if (next.properties && typeof next.properties === "object") {
    const props = next.properties as Record<string, Record<string, unknown>>;
    next.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [
        key,
        boundJsonSchema(value, depth + 1),
      ])
    );
  }
  if (next.items && typeof next.items === "object") {
    next.items = boundJsonSchema(
      next.items as Record<string, unknown>,
      depth + 1
    );
  }
  return next;
}

export function truncateStructuredContent(value: unknown): unknown {
  const json = JSON.stringify(value ?? null);
  if (json.length <= MCP_RESULT_MAX_BYTES) {
    return value;
  }
  return {
    truncated: true,
    preview: json.slice(0, 2000),
  };
}

export function searchContracts(
  contracts: OperationContract[],
  principal: PrincipalContext,
  query: string
): OperationContract[] {
  const needle = query.trim().toLowerCase();
  return contracts
    .filter((contract) => catalogExecuteAllowed(contract, principal))
    .filter((contract) => {
      if (!needle) {
        return true;
      }
      return (
        contract.operationId.includes(needle) ||
        contract.moduleId.toLowerCase().includes(needle) ||
        (contract.description ?? "").toLowerCase().includes(needle) ||
        (contract.summary ?? "").toLowerCase().includes(needle)
      );
    })
    .sort((left, right) => left.operationId.localeCompare(right.operationId));
}

export function modulesFromContracts(
  contracts: OperationContract[],
  principal: PrincipalContext
): Array<{ moduleId: string; operations: number }> {
  const counts = new Map<string, number>();
  for (const contract of contracts.filter((item) =>
    catalogExecuteAllowed(item, principal)
  )) {
    counts.set(contract.moduleId, (counts.get(contract.moduleId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([moduleId, operations]) => ({ moduleId, operations }))
    .sort((left, right) => left.moduleId.localeCompare(right.moduleId));
}
