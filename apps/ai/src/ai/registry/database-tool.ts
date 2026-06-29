import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { callMcpAppTool } from "../mcp-apps/http-client.js";
import type { ToolConfig } from "./types.js";

const refusedDynamicToolInputSchema = z
  .record(z.string(), z.unknown())
  .default({});

const missingExecutionMetadata = [
  "execution mode or operation type",
  "allowed host policy",
  "auth model",
  "HTTP method and request mapping",
  "JSON schema dialect for input validation",
  "tenant/user context propagation contract",
];

export function createNonExecutableDatabaseTool(config: ToolConfig) {
  const mcpConfig = parseMcpAppToolConfig(config);
  if (mcpConfig) {
    return createTool({
      id: config.id,
      description:
        config.description ??
        `Call MCP Apps tool ${mcpConfig.toolName} on ${mcpConfig.serverLabel}.`,
      inputSchema: refusedDynamicToolInputSchema,
      execute: async (input) => callMcpAppTool(mcpConfig, input),
    });
  }

  return createTool({
    id: config.id,
    description: [
      config.description ?? config.name,
      "",
      "This database-backed dynamic tool is metadata-only and is not executable yet. The current registry row stores an endpoint URL and JSON schema metadata, but not the execution policy required to call it safely.",
    ].join("\n"),
    inputSchema: refusedDynamicToolInputSchema,
    execute: async () => ({
      ok: false,
      code: "dynamic_tool_not_executable",
      message:
        "Database-backed dynamic tools are disabled until the registry stores an explicit execution policy. Refusing to call the persisted endpoint URL.",
      tool: {
        endpointUrl: config.endpointUrl,
        id: config.id,
        name: config.name,
      },
      missingExecutionMetadata,
    }),
  });
}

export { missingExecutionMetadata as dynamicToolMissingExecutionMetadata };

function parseMcpAppToolConfig(config: ToolConfig) {
  const raw = config.schemaJson.engenty_mcp_app;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const serverId = readString(record.server_id);
  const serverLabel = readString(record.server_label);
  const serverUrl = readString(record.server_url) ?? config.endpointUrl;
  const toolName = readString(record.tool_name);
  if (!(serverId && serverLabel && serverUrl && toolName)) {
    return null;
  }
  return {
    serverId,
    serverLabel,
    serverUrl,
    toolName,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
