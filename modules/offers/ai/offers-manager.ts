import type { AgentConfig, AgentDefinition } from "@engenty/ai-core";
import {
  buildEngentyApiCatalogTool,
  DEFAULT_AI_CHAT_MODEL_ID,
} from "@engenty/ai-core";

export const OFFERS_MANAGER_AGENT_ID = "offers.manager";

export const OFFERS_MANAGER_SKILL_IDS = [
  "offers-search-and-retrieve",
  "offers-create-and-edit",
  "offers-blocks-management",
];

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 0);
  } catch {
    return String(value);
  }
}

export function buildOffersManagerSystemPrompt(
  context: Record<string, unknown> | null | undefined
): string {
  const offerId =
    typeof context?.offer_id === "string" && context.offer_id.length > 0
      ? context.offer_id
      : null;
  const offerStatus =
    typeof context?.offer_status === "string" ? context.offer_status : null;
  const offerNumber =
    typeof context?.offer_number === "string" ? context.offer_number : null;
  const offerTitle =
    typeof context?.offer_title === "string" ? context.offer_title.trim() : "";
  const listSearch =
    typeof context?.list_search === "string" ? context.list_search.trim() : "";
  const offersPreview = Array.isArray(context?.offers_preview)
    ? context.offers_preview
    : null;

  const lines = [
    "You help users create, edit, and manage sales offers in Engenty.",
    "Use snake_case for all API field names.",
    'Prefer registered catalog operations via `engenty_tools_search` with `moduleId: "offers"` and `engenty_tool_execute`.',
    "Use the active offers skills for detailed operation mappings: search/retrieve, create/edit, and blocks management.",
    "Status labels: draft = Draft (editable), ready = Ready (finalized), accepted = Accepted.",
    "Confirm before status transitions, deletes, or large multi-field writes.",
  ];

  if (offerId) {
    const hint = [offerNumber, offerTitle].filter(Boolean).join(" — ");
    lines.push(
      `Current page: offer ${hint ? `"${hint}"` : `id=${offerId}`} (status: ${offerStatus ?? "unknown"}).`,
      "Use this context for summaries and single-field questions. Call `offers_get` for fresh or complete data."
    );
  } else if (offersPreview && offersPreview.length > 0) {
    lines.push(
      "Visible offers (preloaded from the list the user is viewing):",
      "```json",
      formatJson(offersPreview),
      "```",
      "Use this for list-style questions. Call `offers_list` for full search, filters, or pagination."
    );
  } else {
    if (listSearch) {
      lines.push(`Current list filter from UI: list_search="${listSearch}".`);
    }
    lines.push(
      "Use `engenty_tools_search` then `engenty_tool_execute` for `offers_list` to find offers."
    );
  }

  lines.push(
    "Do not invent offer data. If data is missing after tool calls, say so."
  );

  return lines.join("\n");
}

export function createOffersManagerAgentDefinition(): AgentDefinition {
  return {
    build_system_prompt: ({ context }) =>
      buildOffersManagerSystemPrompt(context),
    build_tools: (execCtx) => ({
      engentyApiCatalog: buildEngentyApiCatalogTool(execCtx) as object,
    }),
    description: "Create, edit, and manage sales offers.",
    id: OFFERS_MANAGER_AGENT_ID,
    instruction_keys: [],
    module_id: "offers",
    name: "Offers Specialist",
    skills: OFFERS_MANAGER_SKILL_IDS,
  };
}

export const offersManagerAgentConfig: AgentConfig = {
  description: "Create, edit, and manage sales offers.",
  id: OFFERS_MANAGER_AGENT_ID,
  instructions: buildOffersManagerSystemPrompt(null),
  model: DEFAULT_AI_CHAT_MODEL_ID,
  name: "Offers Specialist",
  skillIds: OFFERS_MANAGER_SKILL_IDS,
  source: "module",
  toolIds: ["engenty_tools_search", "engenty_tool_execute"],
  workspace: { enabled: true, preset: "staff" },
};
