import type {
  ActionDefinition,
  AgentConfig,
  AgentDefinition,
  AiAgentManifest,
  InstructionDocumentDefinition,
  ToolExecutionContext,
} from "@engenty/ai-core";
import {
  buildMastraWebSearchTool,
  DEFAULT_AI_CHAT_MODEL_ID,
  loadAgentManifest,
  readAgentTextAsset,
} from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { CONTACTS_TOOL_BUILDERS } from "./tool-builders.js";

export const CONTACTS_MANAGER_AGENT_ID = "contacts.manager";

export const CONTACTS_MANAGER_DYNAMIC_TOOL_IDS = [
  "engenty_tools_search",
  "engenty_tool_execute",
  "web_search",
  // Propose researched field values for human review/approval (HITL). Surfaces a
  // field-suggestions approval card instead of a freeform chat summary.
  "proposeUpdates",
];

export const CONTACTS_MANAGER_SKILL_IDS = [
  "contacts-search-and-retrieve",
  "contacts-content-management",
  "contacts-enrichment",
  "contacts-email-extraction",
];

const contactsManagerAssets = {
  agentId: CONTACTS_MANAGER_AGENT_ID,
  importMetaUrl: import.meta.url,
} as const;

let cachedManifest: AiAgentManifest | null = null;

export function getContactsManagerManifest(): AiAgentManifest {
  if (cachedManifest) {
    return cachedManifest;
  }
  cachedManifest = loadAgentManifest(contactsManagerAssets);
  return cachedManifest;
}

export function readContactsManagerAgentsMarkdown(): string {
  return readAgentTextAsset(contactsManagerAssets, "AGENTS.md");
}

export function readContactsManagerSoulMarkdown(): string {
  return readAgentTextAsset(contactsManagerAssets, "SOUL.md");
}

export function readContactsManagerHeartbeatMarkdown(): string {
  return readAgentTextAsset(contactsManagerAssets, "HEARTBEAT.md");
}

function buildContactsManagerTools(options: {
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"];
}): (ctx: ToolExecutionContext) => Record<string, object> {
  return (ctx) => {
    const manifest = getContactsManagerManifest();
    const tools: Record<string, object> = {};
    for (const toolId of manifest.tools) {
      const build = CONTACTS_TOOL_BUILDERS[toolId];
      if (!build) {
        throw new Error(
          `Unknown tool id in contacts manager agent manifest: ${toolId}`
        );
      }
      const piece = build(ctx, options.invokeContactsOperation);
      if (piece) {
        Object.assign(tools, piece);
      }
    }
    return tools;
  };
}

function buildWorkflowContext(
  routeKey: string | null,
  actionPrompt?: string
): string {
  const lines = ["## Active workflow"];
  if (routeKey) {
    lines.push("", `Current route_key: ${routeKey}`);
  } else {
    lines.push("", "No focused workflow was requested. Help the user choose.");
  }
  if (actionPrompt) {
    lines.push("", actionPrompt.trim());
  }
  return lines.join("\n");
}

export function buildContactsManagerSystemPrompt(): string {
  return [
    "You help users manage tenant Contacts in Engenty: search stored contacts, inspect records, extract contacts from emails, research organisations, enrich organisation records, and prepare human-reviewed field suggestions.",
    "Use snake_case for Contacts API field names and patches.",
    "Prefer existing contacts over duplicates. Search before creating, linking, or suggesting a new record.",
    "Use the active Contacts skills for detailed operation mappings: search/retrieve, content management, enrichment, and email extraction.",
    'Use **`engenty_tools_search`** and **`engenty_tool_execute`** for stored Contacts operations and routes. Search with `moduleId: "contacts"` and prefer registered `contacts.*` operations before HTTP routes.',
    "Use `web_search` for external public evidence.",
    "For enrichment, inspect the current contact first, check company info, address, legal/registration, and tax fields, and publish suggestions before summarizing concrete proposed changes.",
    "Do not mutate contacts directly during enrichment unless the user explicitly requested a catalog-backed write outside the HITL suggestion flow.",
    "When public data is ambiguous, surface options instead of guessing.",
    "Be concise, factual, and task-oriented. Separate verified stored data from external public evidence.",
    "If the agent wakes without a direct user prompt or action context, do not mutate anything.",
  ].join("\n");
}

export const contactsManagerAgentConfig: AgentConfig = {
  description:
    "Search, inspect, create, research, and enrich tenant contacts with catalog-backed operations and human-reviewed suggestions.",
  id: CONTACTS_MANAGER_AGENT_ID,
  instructions: buildContactsManagerSystemPrompt(),
  model: DEFAULT_AI_CHAT_MODEL_ID,
  name: "Contacts Specialist",
  skillIds: CONTACTS_MANAGER_SKILL_IDS,
  source: "module",
  toolIds: CONTACTS_MANAGER_DYNAMIC_TOOL_IDS,
};

export function buildContactsManagerDynamicTools(): Record<string, object> {
  return {
    web_search: buildMastraWebSearchTool(createTool) as object,
  };
}

export function createContactsManagerInstructionDocuments(): InstructionDocumentDefinition[] {
  return [
    {
      default_body: readContactsManagerAgentsMarkdown(),
      filename: "AGENTS.md",
      id: "contacts_manager_agents",
      key: "contacts_manager_agents",
      layer: "agent",
      module_id: "contacts",
      owner_id: "contacts.manager",
      owner_kind: "agent",
      title: "Contacts Manager identity",
    },
    {
      default_body: readContactsManagerSoulMarkdown(),
      filename: "SOUL.md",
      id: "contacts_manager_soul",
      key: "contacts_manager_soul",
      layer: "agent",
      module_id: "contacts",
      owner_id: "contacts.manager",
      owner_kind: "agent",
      title: "Contacts Manager tone and behavior",
    },
    {
      default_body: readContactsManagerHeartbeatMarkdown(),
      filename: "HEARTBEAT.md",
      id: "contacts_manager_heartbeat",
      key: "contacts_manager_heartbeat",
      layer: "agent",
      module_id: "contacts",
      owner_id: "contacts.manager",
      owner_kind: "agent",
      title: "Contacts Manager heartbeat guidance",
    },
  ];
}

export function createContactsManagerAgentDefinition(options: {
  actions: ActionDefinition[];
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"];
}): AgentDefinition {
  const { actions, invokeContactsOperation } = options;
  const manifest = getContactsManagerManifest();
  const actionMap = new Map(actions.map((action) => [action.id, action]));
  return {
    build_system_prompt: ({ action }) => {
      const focusedAction = action
        ? (actionMap.get(action.id) ?? action)
        : undefined;
      return buildWorkflowContext(action?.id ?? null, focusedAction?.prompt);
    },
    build_tools: buildContactsManagerTools({ invokeContactsOperation }),
    description: manifest.description,
    id: manifest.id,
    instruction_keys:
      manifest.instruction_keys.length > 0
        ? manifest.instruction_keys
        : ["contacts_manager_agents", "contacts_manager_soul"],
    module_id: manifest.module_id,
    name: manifest.name,
    ...(manifest.skills.length > 0 ? { skills: manifest.skills } : {}),
  };
}
