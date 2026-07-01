import type {
  AgentConfig,
  AgentDefinition,
  InstructionDocumentDefinition,
} from "@engenty/ai-core";
import {
  buildEngentyApiCatalogTool,
  DEFAULT_AI_CHAT_MODEL_ID,
  readAgentTextAsset,
  webSearchTool,
} from "@engenty/ai-core";

export const KB_MANAGER_AGENT_ID = "knowledge-base.manager";

export const KB_MANAGER_DYNAMIC_TOOL_IDS = [
  "engenty_tools_search",
  "engenty_tool_execute",
  "web_search",
];

export const KB_MANAGER_SKILL_IDS = [
  "kb-agentic-source-ingest",
  "kb-article-content-management",
  "kb-faq-content-management",
  "kb-ingest",
  "kb-maintenance",
  "kb-search-and-retrieve",
  "kb-source-manager",
  "kb-structure-management",
];

const kbManagerAssets = {
  agentId: KB_MANAGER_AGENT_ID,
  importMetaUrl: import.meta.url,
} as const;

export function readKbManagerAgentsMarkdown(): string {
  return readAgentTextAsset(kbManagerAssets, "AGENTS.md");
}

export function createKbManagerInstructionDocuments(): InstructionDocumentDefinition[] {
  return [
    {
      default_body: readKbManagerAgentsMarkdown(),
      filename: "AGENTS.md",
      id: "knowledge_base_manager_agents",
      key: "knowledge_base_manager_agents",
      layer: "agent",
      module_id: "knowledge-base",
      owner_id: "knowledge-base.manager",
      owner_kind: "agent",
      title: "Knowledge Base Manager identity",
    },
  ];
}

export const kbManagerAgentConfig: AgentConfig = {
  description:
    "Capture raw material to inbox, triage and suggest KB structure, answer with citations, and run maintenance checks.",
  id: KB_MANAGER_AGENT_ID,
  instructions: readKbManagerAgentsMarkdown(),
  model: DEFAULT_AI_CHAT_MODEL_ID,
  name: "Knowledge Base Specialist",
  skillIds: KB_MANAGER_SKILL_IDS,
  source: "module",
  toolIds: KB_MANAGER_DYNAMIC_TOOL_IDS,
  workspace: {
    enabled: true,
    preset: "staff",
  },
};

export function buildKbManagerDynamicTools(): Record<string, object> {
  return {};
}

export function createKbManagerAgent(): AgentDefinition {
  return {
    build_tools: (execCtx) => ({
      engentyApiCatalog: buildEngentyApiCatalogTool(execCtx) as object,
      web_search: webSearchTool,
    }),
    description: "Knowledge base capture, compilation, and maintenance.",
    id: KB_MANAGER_AGENT_ID,
    instruction_keys: ["knowledge_base_manager_agents"],
    module_id: "knowledge-base",
    name: "Knowledge Base Specialist",
  };
}
