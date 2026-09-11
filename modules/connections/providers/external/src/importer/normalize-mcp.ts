import { type McpSessionParams, mcpListTools } from "../invoke/mcp-client.js";
import type { NormalizedAction, NormalizeResult } from "../types.js";
import { classifyMcpTool } from "./classify.js";
import { MAX_ACTIONS_PER_CONNECTOR } from "./normalize-openapi.js";

function humanizeToolName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_\-.]+/gu, " ")
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : name;
}

/** MCP server tools/list → normalized actions. */
export async function normalizeMcpServer(
  params: McpSessionParams
): Promise<NormalizeResult> {
  const tools = await mcpListTools(params);

  const actions: NormalizedAction[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const seenIds = new Set<string>();
  let droppedCount = 0;

  for (const tool of tools) {
    if (actions.length >= MAX_ACTIONS_PER_CONNECTOR) {
      droppedCount += 1;
      continue;
    }
    const id = tool.name
      .replace(/[^a-zA-Z0-9]+/gu, "_")
      .replace(/^_+|_+$/gu, "")
      .toLowerCase()
      .slice(0, 60);
    if (!id || seenIds.has(id)) {
      skipped.push({
        id: tool.name,
        reason: id ? "duplicate tool name" : "unusable tool name",
      });
      continue;
    }
    seenIds.add(id);
    // Humanize bare tool names ("read_wiki_structure" → "Read wiki structure")
    // so catalogs, the permissions matrix, and approval cards read naturally.
    const summary = tool.title ?? humanizeToolName(tool.name);
    actions.push({
      classification: classifyMcpTool(tool.annotations ?? {}),
      description: tool.description ?? summary,
      id,
      input_json_schema: tool.inputSchema ?? {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      invoke: { kind: "mcp", tool_name: tool.name },
      summary,
      tags: [],
    });
  }

  return {
    actions,
    applied_overrides: 0,
    base_url: null,
    description: null,
    dropped_count: droppedCount,
    security_schemes: null,
    skipped,
    title: null,
  };
}
