import type {
  AgentConfig,
  AgentDefinition,
  InstructionDocumentDefinition,
} from "@engenty/ai-core";
import { DEFAULT_AI_CHAT_MODEL_ID, readAgentTextAsset } from "@engenty/ai-core";

export const KB_ANSWERS_AGENT_ID = "knowledge-base.answers";

export const KB_ANSWERS_TOOL_IDS = [
  "knowledge_base_article_search",
  "kb_faqs_list",
  // Asking the user to choose is read-only — it writes nothing and keeps the
  // agent's scoped-retrieval contract. Resolved from the builtin registry
  // (createBuiltinRegistryTools), and it degrades to the artifact when the run
  // has no human channel, so headless callers of this agent cannot hang on it.
  "requestDecision",
] as const;

export const KB_ANSWERS_SKILL_IDS = ["kb-search-and-retrieve"] as const;

const kbAnswersAssets = {
  agentId: KB_ANSWERS_AGENT_ID,
  importMetaUrl: import.meta.url,
} as const;

export function readKbAnswersAgentsMarkdown(): string {
  return readAgentTextAsset(kbAnswersAssets, "AGENTS.md");
}

export const kbAnswersAgentConfig: AgentConfig = {
  description:
    "Answers questions strictly from the knowledge base — read-only, scoped retrieval.",
  id: KB_ANSWERS_AGENT_ID,
  instructions: readKbAnswersAgentsMarkdown(),
  model: DEFAULT_AI_CHAT_MODEL_ID,
  name: "KB Answers",
  skillIds: [...KB_ANSWERS_SKILL_IDS],
  source: "module",
  toolIds: [...KB_ANSWERS_TOOL_IDS],
  workspace: {
    enabled: false,
    preset: "custom",
  },
};

export function createKbAnswersInstructionDocuments(): InstructionDocumentDefinition[] {
  return [
    {
      default_body: readKbAnswersAgentsMarkdown(),
      filename: "AGENTS.md",
      id: "knowledge_base_answers_agents",
      key: "knowledge_base_answers_agents",
      layer: "agent",
      module_id: "knowledge-base",
      owner_id: KB_ANSWERS_AGENT_ID,
      owner_kind: "agent",
      title: "Knowledge Base Answers identity",
    },
  ];
}

export function createKbAnswersAgent(): AgentDefinition {
  return {
    build_tools: () => ({}),
    description: "Answers questions strictly from the knowledge base.",
    id: KB_ANSWERS_AGENT_ID,
    instruction_keys: ["knowledge_base_answers_agents"],
    module_id: "knowledge-base",
    name: "KB Answers",
  };
}
