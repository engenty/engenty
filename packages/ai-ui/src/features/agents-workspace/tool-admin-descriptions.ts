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
