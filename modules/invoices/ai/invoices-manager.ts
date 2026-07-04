import type { AgentConfig, AgentDefinition } from "@engenty/ai-core";
import {
  buildEngentyApiCatalogTool,
  DEFAULT_AI_CHAT_MODEL_ID,
} from "@engenty/ai-core";

export const INVOICES_MANAGER_AGENT_ID = "invoices.manager";

export const INVOICES_MANAGER_SKILL_IDS = [
  "invoices-search-and-retrieve",
  "invoices-create-and-edit",
  "invoices-blocks-management",
];

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 0);
  } catch {
    return String(value);
  }
}

export function buildInvoicesManagerSystemPrompt(
  context: Record<string, unknown> | null | undefined
): string {
  const invoiceId =
    typeof context?.invoice_id === "string" && context.invoice_id.length > 0
      ? context.invoice_id
      : null;
  const invoiceStatus =
    typeof context?.invoice_status === "string" ? context.invoice_status : null;
  const invoiceNumber =
    typeof context?.invoice_number === "string" ? context.invoice_number : null;
  const listSearch =
    typeof context?.list_search === "string" ? context.list_search.trim() : "";
  const invoicesPreview = Array.isArray(context?.invoices_preview)
    ? context.invoices_preview
    : null;

  const lines = [
    "You help users assemble, edit, and manage invoices in Engenty.",
    "Use snake_case for all API field names.",
    'Prefer registered catalog operations via `engenty_tools_search` with `moduleId: "invoices"` and `engenty_tool_execute`.',
    "Use the active invoices skills for operation mappings: search/retrieve, create/edit, and blocks management.",
    "Lifecycle: draft (editable) → issued (Festschreibung; frozen) → sent → paid. cancelled is reached only via a Storno.",
    "Only draft invoices can be edited. Build a complete draft with line-item blocks; the owner approves issuing — never issue or send without explicit confirmation.",
    "When assembling an invoice from hours/materials, map each position to a line_item block and flag plausibility gaps (e.g. hours booked but no material).",
    "Confirm before issue, status transitions, cancel, or deletes.",
  ];

  if (invoiceId) {
    const hint = invoiceNumber ?? invoiceId;
    lines.push(
      `Current page: invoice ${hint} (status: ${invoiceStatus ?? "unknown"}).`,
      "Use this context for summaries. Call `invoices_get` for fresh or complete data, `invoices_get_blocks` for positions."
    );
  } else if (invoicesPreview && invoicesPreview.length > 0) {
    lines.push(
      "Visible invoices (preloaded from the list the user is viewing):",
      "```json",
      formatJson(invoicesPreview),
      "```",
      "Use this for list-style questions. Call `invoices_list` for full search or filters."
    );
  } else {
    if (listSearch) {
      lines.push(`Current list filter from UI: list_search="${listSearch}".`);
    }
    lines.push(
      "Use `engenty_tools_search` then `engenty_tool_execute` for `invoices_list` to find invoices."
    );
  }

  lines.push(
    "Do not invent invoice data. If data is missing after tool calls, say so."
  );

  return lines.join("\n");
}

export function createInvoicesManagerAgentDefinition(): AgentDefinition {
  return {
    build_system_prompt: ({ context }) =>
      buildInvoicesManagerSystemPrompt(context),
    build_tools: (execCtx) => ({
      engentyApiCatalog: buildEngentyApiCatalogTool(execCtx) as object,
    }),
    description: "Assemble, edit, and manage invoices.",
    id: INVOICES_MANAGER_AGENT_ID,
    instruction_keys: [],
    module_id: "invoices",
    name: "Invoices Specialist",
    skills: INVOICES_MANAGER_SKILL_IDS,
  };
}

export const invoicesManagerAgentConfig: AgentConfig = {
  description: "Assemble, edit, and manage invoices.",
  id: INVOICES_MANAGER_AGENT_ID,
  instructions: buildInvoicesManagerSystemPrompt(null),
  model: DEFAULT_AI_CHAT_MODEL_ID,
  name: "Invoices Specialist",
  skillIds: INVOICES_MANAGER_SKILL_IDS,
  source: "module",
  toolIds: ["engenty_tools_search", "engenty_tool_execute"],
  workspace: { enabled: true, preset: "staff" },
};
