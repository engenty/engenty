/**
 * Curated **one-line operator copy** for the admin tools list (readable, stable, and
 * safe to tune without pulling the whole runtime graph into the UI bundle).
 *
 * **Runtime truth** for developer mode (Zod → JSON Schema, live `tool({ description })`)
 * comes from `GET /api/admin/ai/agents/:agentId/tool-schemas` (`fetchAdminAgentToolSchemas`
 * in `packages/ai-ui`) — keep this map aligned with `tool({ description })`
 * in `packages/ai-core` and module `ai/tools/*` where possible.
 */
const TOOL_ADMIN_DESCRIPTIONS: Record<string, string> = {
  "create-article":
    "Create a new knowledge base article (draft by default); refreshes embeddings for the new body.",
  "create-inbox-item":
    "Create a KB inbox capture row (raw material before triage or promote to article/FAQ).",
  "get-article": "Retrieve the full content of a KB article by its ID.",
  "get-inbox-item":
    "Load one KB inbox capture row (raw material before promote) by id.",
  "list-articles":
    "List articles from the knowledge base, optionally filtered by category or status.",
  "list-faqs": "List frequently asked questions from the knowledge base.",
  "search-kb":
    "Search the knowledge base for articles matching a query (embedding similarity over stored chunks).",
  "update-article":
    "Patch a KB article (partial fields); refreshes embeddings when body text changes; locked articles reject edits except unlock.",
  "update-inbox-item":
    "Patch a KB inbox row (triage fields, status, raw markdown/text).",
  engentyApiCatalog:
    "Discover Engenty APIs before fetching data (routes, operations, schema hints).",
  engentyApi:
    "Fetch data from Engenty API (GET); set contextKey for widget state paths and params for pagination.",
  web_search:
    "General web search for complementary public facts and first-party pages.",
  chatSessionSearch:
    "Search indexed chat sessions (hybrid lexical + semantic); surfaces index health when incomplete.",
  delegateToAgent:
    "Run a bounded read-only task with a specialist agent and return its answer.",
  memory:
    "Manage long-term agent memory (view, create, patch, delete, rename named paths).",
  searchContacts:
    "Search stored contacts with fuzzy/hybrid matching, filters, and match evidence.",
  loadContact:
    "Load the current contact record; defaults to the scoped contact id.",
  austriaCompanyLookup:
    "Look up Austrian company data (Firmenbuch, UID-Check, Impressum) from name, VAT id, or website.",
  firmenbuch: "Query Austrian Firmenbuch company registry details.",
  uidCheck: "Validate or resolve Austrian UID (VAT) numbers.",
  // The catalog floor every hired Engenty carries (ai-core `hire-floor.ts`).
  engenty_tools_search:
    "Find operations in the Space's app catalog by what they do.",
  engenty_tools_discover:
    "Read one operation's schema and gate before calling it.",
  engenty_tool_execute:
    "Run a catalog operation; gated writes ask for approval first.",
  engenty_tools_preapprove:
    "Ask once for a batch of gated operations before a multi-step job.",
  artifact_write: "Save a durable deliverable (document, table, report).",
  artifact_read: "Read an artifact back, by id or scope.",
  table_write: "Write rows into a Space Data table.",
  table_read: "Read rows from a Space Data table.",
  app_build: "Build an App version from a manifest for a person to activate.",
  routines_list: "List the routines this agent owns.",
  routines_run: "Fire one of its own routines now.",
  routines_update: "Adjust an owned routine's schedule or brief.",
  workflows_list: "Look up published Workflows by name.",
  invoke_workflow: "Run a published Workflow as one governed step.",
  message_agent: "Ask or hand work to a colleague in the Space.",
  agent_status: "See what a colleague is doing — read-only.",
  desk_post:
    "Leave a short note on its own desk, unprompted, with an inbox update.",
  show_ui: "Answer with a small generated surface instead of prose.",
  show_objects: "Show records from the Space beside the reply.",
  show_artifact: "Open an artifact next to the chat.",
  thread_state_set: "Keep where a multi-turn exercise stands.",
  agent_self_revise: "Propose a change to its own instructions, for approval.",
  agent_look:
    "Design its own face: pick a blob, generate a portrait, or propose a name.",
  workflow_self_revise:
    "Propose a new version of a Workflow it owns, for approval.",
};

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/u)
    .filter(Boolean)
    .map((w) => (w.length ? `${w[0]!.toUpperCase()}${w.slice(1)}` : w))
    .join(" ");
}

/** Readable fallback when no catalog string exists (kebab, snake, camel). */
export function humanizeToolId(id: string): string {
  const spaced = id
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) {
    return id;
  }
  return titleCaseWords(spaced.toLowerCase());
}

export function resolveToolAdminDescription(toolId: string): string {
  const direct = TOOL_ADMIN_DESCRIPTIONS[toolId];
  if (direct) {
    return direct;
  }
  const normalized = toolId.trim();
  const lower = normalized.toLowerCase();
  const byLower = Object.entries(TOOL_ADMIN_DESCRIPTIONS).find(
    ([key]) => key.toLowerCase() === lower
  );
  if (byLower) {
    return byLower[1];
  }
  return humanizeToolId(normalized);
}
