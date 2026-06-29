import { z } from "zod";
import { resolveAgentDefinitionById } from "../registry.js";
import type { ToolExecutionContext } from "../tools/types.js";

interface ToolLike {
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

function filterToolsByAllowList(
  tools: Record<string, ToolLike>,
  allowed?: string[]
): Record<string, ToolLike> {
  if (!allowed?.length) {
    return tools;
  }
  const include = new Set(allowed);
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => include.has(name))
  );
}

function zodLikeToJsonSchema(schema: unknown): Record<string, unknown> | null {
  if (schema == null || typeof schema !== "object") {
    return null;
  }
  try {
    return z.toJSONSchema(schema as z.ZodType) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AgentToolSchemaSnapshot {
  description: string | null;
  input_schema_json: Record<string, unknown> | null;
  output_schema_json: Record<string, unknown> | null;
  tool_id: string;
}

/**
 * Serializes live tool Zod schemas for admin / developer UI. Uses the same
 * `build_tools` path as runtime (read-only; does not execute tools).
 */
export function listAgentToolSchemaSnapshots(params: {
  agentId: string;
  /** When set, same filter as effective union-of-skills tools in the UI. */
  allowedToolNames?: string[];
}): AgentToolSchemaSnapshot[] | null {
  const def = resolveAgentDefinitionById(params.agentId);
  if (!def?.build_tools) {
    return null;
  }
  const ctx: ToolExecutionContext = {
    action: "admin.tool-schema-introspection",
    agentId: def.id,
    moduleId: def.module_id,
    orchestratorThreadId: null,
    scope: null,
    scopeId: null,
    tenantId: null,
    userId: null,
    callGatewayMethod: async () => {
      throw new Error("Tool schema introspection does not invoke the gateway");
    },
  };
  const built = def.build_tools(ctx) as Record<string, ToolLike>;
  const filtered = filterToolsByAllowList(built, params.allowedToolNames);
  return Object.entries(filtered)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tool_id, t]) => ({
      tool_id,
      description: typeof t.description === "string" ? t.description : null,
      input_schema_json: zodLikeToJsonSchema(t.inputSchema),
      output_schema_json: zodLikeToJsonSchema(t.outputSchema),
    }));
}
