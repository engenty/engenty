import { Agent } from "@mastra/core/agent";
import type { Mastra } from "@mastra/core/mastra";
import type { MastraMemory } from "@mastra/core/memory";
import { gateway } from "ai";

import type { AiRegistry } from "../registry/types.js";
import type {
  EngentyWorkspaceAgentConfig,
  EngentyWorkspaceRuntimeSpec,
} from "./contracts.js";
import { createEngentyAgentWorkspace } from "./loader.js";
import {
  CATALOG_META_TOOL_IDS,
  TOOL_PROFILE_ALLOWLISTS,
} from "./tool-profiles.js";

export interface AssembleWorkspaceAgentOptions {
  mastra?: Mastra;
  memory?: MastraMemory;
  registry?: AiRegistry;
  runtimeSpec: EngentyWorkspaceRuntimeSpec;
}

/**
 * Assembles a Mastra Agent with an attached Workspace (skills via filesystem discovery).
 * Module/core tools still resolve through the optional legacy AiRegistry seam until W4.
 */
export async function assembleWorkspaceAgent(
  config: EngentyWorkspaceAgentConfig,
  options: AssembleWorkspaceAgentOptions
): Promise<Agent> {
  const { workspace } = createEngentyAgentWorkspace({
    ...options.runtimeSpec,
    agentConfig: config,
  });

  const subAgents: Record<string, Agent> = {};
  for (const sub of config.subAgents) {
    const child = await assembleWorkspaceAgent(
      {
        ...config,
        id: sub.id,
        name: sub.alias ?? sub.id,
        subAgents: [],
      },
      options
    );
    subAgents[sub.alias ?? sub.id] = child;
  }

  // Defense-in-depth: chatbot agents run on the external trust boundary (anonymous
  // visitors). Even if a DB row were tampered with directly, only external-safe tools
  // may be attached. Per-chatbot MCP tools (mcp.chatbot_*) are always safe.
  const isChatbotAgent = config.id.startsWith("chatbot_");
  const CHATBOT_EXTERNAL_SAFE_TOOLS = new Set([
    "knowledge_base_article_search",
    "kb_faqs_list",
    "requestDecision",
  ]);
  const isExternalSafeTool = (toolId: string) =>
    CHATBOT_EXTERNAL_SAFE_TOOLS.has(toolId) ||
    toolId.startsWith("mcp.chatbot_");

  // Defense-in-depth: profiled agents (tool_profile field) are restricted to
  // their declared allowlist, regardless of the config row's toolIds. Catalog
  // meta-tools (engenty_tools_search, engenty_tool_execute) are also suppressed
  // so a read_only_kb agent cannot reach the catalog surface.
  const toolProfile = config.tool_profile ?? null;
  const profileAllowlist = toolProfile
    ? TOOL_PROFILE_ALLOWLISTS[toolProfile]
    : null;

  const extraTools: Record<string, unknown> = {};
  if (options.registry) {
    for (const toolId of config.toolIds) {
      if (isChatbotAgent && !isExternalSafeTool(toolId)) {
        continue;
      }
      // Profile guard: only allowlisted tools may attach; catalog meta-tools are
      // always suppressed for profiled agents.
      if (
        profileAllowlist !== null &&
        (!profileAllowlist.has(toolId) || CATALOG_META_TOOL_IDS.has(toolId))
      ) {
        continue;
      }
      const tool = await options.registry.getTool(toolId);
      if (tool) {
        extraTools[toolId] = tool;
      }
    }
  }

  return new Agent({
    description: config.description,
    id: config.id,
    instructions: config.instructions,
    ...(Object.keys(subAgents).length > 0 ? { agents: subAgents } : {}),
    ...(options.mastra ? { mastra: options.mastra } : {}),
    ...(options.memory ? { memory: options.memory } : {}),
    model: gateway(config.model),
    ...(Object.keys(extraTools).length > 0
      ? { tools: extraTools as Agent["tools"] }
      : {}),
    workspace,
  });
}
