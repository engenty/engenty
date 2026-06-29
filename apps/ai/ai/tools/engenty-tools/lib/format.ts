import {
  EngentyCoreHttpError,
  type EngentyToolContract,
} from "../../../../src/ai/core-http-client.js";
import type { NormalizedEngentyToolEntry } from "../schema/types.js";

export function normalizeToolContract(
  contract: EngentyToolContract
): NormalizedEngentyToolEntry {
  const toolId = contract.toolId ?? contract.operationId ?? contract.methodName;
  if (!toolId) {
    throw new EngentyCoreHttpError(
      "Core returned a tool contract without a tool id.",
      200,
      "invalid_tool_contract",
      contract
    );
  }
  const riskLevel = contract.auth?.riskLevel ?? "medium";
  const requiresApproval = contract.auth?.requiresApproval ?? false;
  const readOnly = riskLevel === "low" && !requiresApproval;
  return {
    auth: {
      requiredCapabilities: contract.auth?.requiredCapabilities ?? [],
      requiredPermissions: contract.auth?.requiredPermissions ?? [],
      requiredScopes: contract.auth?.requiredScopes ?? [],
      requiresApproval,
      riskLevel,
    },
    description: contract.description,
    execution: {
      approvalBehavior: requiresApproval
        ? "requires_approval"
        : riskLevel === "high" || riskLevel === "critical"
          ? "may_require_approval"
          : "none",
      readOnly,
      recommendedForAgents: true,
    },
    id: toolId,
    input: {
      jsonSchema: contract.inputSchema?.jsonSchema,
      schemaHint: contract.inputSchema?.hint,
      schemaType: contract.inputSchema?.type,
    },
    kind: "tool",
    moduleId: contract.moduleId,
    output: {
      jsonSchema: contract.outputSchema?.jsonSchema,
      schemaHint: contract.outputSchema?.hint,
      schemaType: contract.outputSchema?.type,
    },
    pluginId: contract.pluginId,
    summary: contract.summary,
    title: contract.summary ?? toolId,
    tool: {
      invokePath: `/api/tools/${encodeURIComponent(toolId)}/invoke`,
      toolId,
    },
  };
}

export function groupByModule(entries: NormalizedEngentyToolEntry[]) {
  const groups = new Map<
    string,
    {
      matches: ReturnType<typeof toSearchResult>[];
      moduleId: string;
      title: string;
    }
  >();
  for (const entry of entries) {
    const moduleId = entry.moduleId ?? "core";
    const group = groups.get(moduleId) ?? {
      matches: [],
      moduleId,
      title: moduleId,
    };
    group.matches.push(toSearchResult(entry));
    groups.set(moduleId, group);
  }
  return [...groups.values()];
}

export function toSearchResult(entry: NormalizedEngentyToolEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    moduleId: entry.moduleId,
    readOnly: entry.execution.readOnly,
    requiredCapabilities: entry.auth.requiredCapabilities,
    requiresApproval: entry.auth.requiresApproval,
    riskLevel: entry.auth.riskLevel,
    summary: entry.summary,
    title: entry.title,
    toolId: entry.tool.toolId,
    description: entry.description,
    inputSchema: entry.input.jsonSchema,
    outputSchema: entry.output.jsonSchema,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
