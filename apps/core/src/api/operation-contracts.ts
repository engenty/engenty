import type {
  McpDisposition,
  McpSafeAnnotations,
  OperationSpacePolicy,
} from "@engenty/plugin-sdk";
import {
  recordScopeFromSpacePolicy,
  resolveMcpDisposition,
} from "@engenty/plugin-sdk";
import { z } from "zod";
import type { PluginRegistry } from "../plugins/registry.js";

interface SchemaSummary {
  hint?: string;
  jsonSchema?: Record<string, unknown>;
  type: "zod" | "none";
}

export interface OperationContract {
  auth: {
    requiredCapabilities: string[];
    requiredPermissions: string[];
    requiredScopes: string[];
    riskLevel: "low" | "medium" | "high" | "critical";
    requiresApproval: boolean;
    allowedPrincipalTypes: Array<"user" | "agent" | "service">;
  };
  description?: string;
  inputSchema: SchemaSummary;
  mcp: {
    annotations?: McpSafeAnnotations;
    appResourceUri?: string;
    declared: boolean;
    disposition: McpDisposition;
    enabled: boolean;
    taskCapable: boolean;
  };
  methodName: string;
  moduleId: string;
  operationId: string;
  outputSchema: SchemaSummary;
  pluginId: string;
  readOnly: boolean;
  /** Present when the operation declared `spacePolicy` — catalog, not guessed. */
  record_scope?: OperationSpacePolicy["kind"];
  spacePolicy?: OperationSpacePolicy;
  summary?: string;
  toolId: string;
  transports: Array<"rest" | "cli" | "mcp">;
}

function summarizeSchema(
  schema: unknown,
  io: "input" | "output"
): SchemaSummary {
  if (!schema || typeof schema !== "object") {
    return { type: "none" };
  }
  const shape = schema as { _def?: { typeName?: unknown } };
  return {
    type: "zod",
    hint:
      typeof shape._def?.typeName === "string"
        ? shape._def.typeName
        : "zod_schema",
    jsonSchema: toJsonSchema(schema, io),
  };
}

function toJsonSchema(
  schema: unknown,
  io: "input" | "output"
): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object") {
    return;
  }
  try {
    const result = z.toJSONSchema(schema as z.ZodType, { io }) as Record<
      string,
      unknown
    >;
    const { $schema: _schema, ...rest } = result;
    return rest;
  } catch {
    return;
  }
}

export function buildOperationContracts(
  registry: PluginRegistry
): OperationContract[] {
  return registry.moduleOperations.map((operation) => {
    const spacePolicy = operation.operation.spacePolicy;
    const record_scope = recordScopeFromSpacePolicy(spacePolicy);
    const resolved = resolveMcpDisposition({
      idempotent: operation.operation.idempotent,
      mcpDisposition: operation.operation.mcpDisposition,
      operationId: operation.operationId,
      requiresApproval: operation.operation.requiresApproval,
      riskLevel: operation.operation.riskLevel,
    });
    const disposition = resolved.disposition;
    const mcpEnabled = disposition !== "never";
    return {
      operationId: operation.operationId,
      toolId: operation.operationId,
      methodName: operation.methodName,
      pluginId: operation.pluginId,
      moduleId: operation.operation.moduleId,
      readOnly:
        operation.operation.idempotent === true &&
        operation.operation.riskLevel === "low" &&
        !operation.operation.requiresApproval,
      summary: operation.summary,
      description: operation.description,
      inputSchema: summarizeSchema(operation.inputSchema, "input"),
      outputSchema: summarizeSchema(operation.outputSchema, "output"),
      auth: {
        requiredCapabilities: operation.operation.requiredCapabilities,
        requiredPermissions: operation.operation.requiredCapabilities.map(
          (capability) => `cap:${capability}`
        ),
        requiredScopes: [],
        riskLevel: operation.operation.riskLevel,
        requiresApproval: operation.operation.requiresApproval,
        allowedPrincipalTypes: ["user", "agent", "service"],
      },
      transports: mcpEnabled
        ? (["rest", "cli", "mcp"] as const)
        : (["rest", "cli"] as const),
      mcp: {
        declared: resolved.declared,
        disposition,
        enabled: mcpEnabled,
        taskCapable: operation.operation.mcpTaskCapable === true,
        ...(operation.operation.mcpAppResourceUri
          ? { appResourceUri: operation.operation.mcpAppResourceUri }
          : {}),
        ...(operation.operation.mcpSafeAnnotations
          ? { annotations: operation.operation.mcpSafeAnnotations }
          : {}),
      },
      ...(record_scope ? { record_scope } : {}),
      ...(spacePolicy ? { spacePolicy } : {}),
    };
  });
}
