import type { OperationSpacePolicy } from "@engenty/plugin-sdk";
import { recordScopeFromSpacePolicy } from "@engenty/plugin-sdk";
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
      transports: ["rest", "cli", "mcp"],
      ...(record_scope ? { record_scope } : {}),
      ...(spacePolicy ? { spacePolicy } : {}),
    };
  });
}
