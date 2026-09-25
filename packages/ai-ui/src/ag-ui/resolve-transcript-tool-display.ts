import { readDecisionResumeAnswer } from "@engenty/ai-core/browser";
import { getEngentyI18nApi } from "@engenty/i18n/ui";
import { readAgentDisplayName } from "./agent-display-names.js";
import {
  isToolApprovalArtifactOutput,
  parseToolApprovalResolution,
  readToolApprovalArtifactTitle,
} from "./tool-approval.js";

/**
 * A row's words in the reader's language. The rows are built outside React
 * (the adapter bakes them into each part), so this reads the app's shared
 * translator; without one — tests, tools — the English stays.
 */
function translate(
  key: string,
  english: string,
  values: Record<string, unknown>
): string {
  const t = getEngentyI18nApi()?.t;
  if (t) {
    return t(`ai-ui:${key}`, { ...values, defaultValue: english });
  }
  return english.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(values[name] ?? "")
  );
}

type Say = (
  key: string,
  english: string,
  values?: Record<string, unknown>
) => string;

/** A finished step: "Created …", "Read …". */
const say: Say = (key, english, values = {}) =>
  translate(`toolRow.${key}`, english, values);

/** The same step while it runs: "Creating …", "Reading …". */
const RUNNING_ENGLISH: Record<string, string> = {
  agentAsk: "Asking {{name}}",
  discoveredFor: 'Looking for tools for "{{query}}"',
  discoveredTools: "Looking for tools",
  listedFiles: "Listing files",
  listedModules: "Listing modules",
  ran: "Running {{name}}",
  ranShell: "Running a shell command",
  readFile: "Reading a file",
  readNamed: "Reading {{name}}",
  searchedFiles: "Searching files",
  searchedModuleTools: "Searching {{module}} tools",
  searchedTools: "Searching tools",
  "verb.add": "Adding",
  "verb.backfill": "Backfilling",
  "verb.create": "Creating",
  "verb.delete": "Deleting",
  "verb.discover": "Looking for",
  "verb.fetch": "Fetching",
  "verb.get": "Opening",
  "verb.list": "Listing",
  "verb.read": "Reading",
  "verb.remove": "Removing",
  "verb.search": "Searching",
  "verb.send": "Sending",
  "verb.update": "Updating",
  "verb.write": "Saving",
  webSearch: "Searching the web",
  webSearchQuery: "Searching the web: {{query}}",
  wroteFile: "Writing a file",
  wroteNamed: "Writing {{name}}",
};

const sayRunning: Say = (key, english, values = {}) => {
  const running = RUNNING_ENGLISH[key];
  return running
    ? translate(`toolRow.running.${key}`, running, values)
    : say(key, english, values);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

const QUOTED_ARG_KEYS = [
  "query",
  "q",
  "name",
  "title",
  "label",
  "subject",
  "slug",
  "search_query",
  "to",
  "path",
] as const;

// One level of common arg wrappers to look inside when the quoted arg isn't at the
// top level — e.g. `*_update` ops nest the changed fields under `data`/`patch`/`values`.
const NESTED_ARG_CONTAINERS = [
  "input",
  "data",
  "values",
  "patch",
  "body",
  "record",
  "fields",
  "payload",
] as const;

const EXECUTE_ID_KEYS = [
  "contractId",
  "contract_id",
  "id",
  "tool_id",
  "operationId",
  "operation_id",
] as const;

const ACTION_VERB_MAP: Record<string, string> = {
  add: "Added",
  backfill: "Backfilled",
  create: "Created",
  delete: "Deleted",
  fetch: "Fetched",
  get: "Opened",
  list: "Listed",
  read: "Read",
  remove: "Removed",
  search: "Searched",
  send: "Sent",
  update: "Updated",
  write: "Saved",
};

const QUOTED_ARG_MAX_LEN = 48;

function humanizeSegment(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeToolId(id: string): string {
  const last = id.split(/[._]/).at(-1) ?? id;
  return humanizeSegment(last);
}

function titleCaseAction(action: string): string {
  return humanizeSegment(action);
}

const COMPOUND_ACTION_SUFFIXES = [
  "actor_for_principal",
  "list_catalog",
  "apply_draft_patch",
  "add_contact_role",
  "count_by_client_ids",
  "create_in_tenant",
  "get_profile",
  "index_health",
  "test_connection",
  "create_relation",
  "delete_relation",
  "update_relation",
  "list_relations",
  "list_activity",
  "list_runs",
  "list_accounts",
  "list_messages",
  "list_by_client",
  "sync_trigger",
  "set_theme",
  "set_locale",
].sort((a, b) => b.length - a.length);

export function parseOperationId(operationId: string): {
  action: string;
  scope: string | null;
} {
  const parts = operationId.includes(".")
    ? operationId.split(".").filter(Boolean)
    : operationId.split("_").filter(Boolean);
  if (parts.length < 2) {
    return { action: parts[0] ?? operationId, scope: null };
  }
  if (!operationId.includes(".")) {
    for (const compound of COMPOUND_ACTION_SUFFIXES) {
      const compoundParts = compound.split("_");
      if (parts.length >= compoundParts.length + 1) {
        const end = parts.slice(-compoundParts.length).join("_");
        if (end === compound) {
          const scopeIndex = parts.length - compoundParts.length - 1;
          return {
            action: compound,
            scope: scopeIndex >= 0 ? (parts[scopeIndex] ?? null) : null,
          };
        }
      }
    }
  }
  const action = parts.at(-1) ?? operationId;
  const scope =
    parts.length === 2 ? (parts[0] ?? null) : (parts.at(-2) ?? null);
  return { action, scope };
}

function readNestedQuotedArg(record: Record<string, unknown>): string | null {
  for (const container of NESTED_ARG_CONTAINERS) {
    const nested = record[container];
    if (isRecord(nested)) {
      const found = readString(nested, [...QUOTED_ARG_KEYS]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function readQuotedArg(input: unknown): string | null {
  const record = isRecord(input) ? input : null;
  if (!record) {
    return null;
  }
  const raw =
    readString(record, [...QUOTED_ARG_KEYS]) ?? readNestedQuotedArg(record);
  if (!raw) {
    return null;
  }
  if (raw.length <= QUOTED_ARG_MAX_LEN) {
    return raw;
  }
  return `${raw.slice(0, QUOTED_ARG_MAX_LEN - 1)}…`;
}

export function formatTranscriptToolRow(params: {
  metadata?: string;
  /** When `always`, suffix shows even without a quoted arg (execute rows). */
  metadataMode?: "always" | "when-quoted";
  quoted?: string;
  verb: string;
}): { displayLabel: string; metadata?: string } {
  const displayLabel = params.quoted
    ? say("quoted", '{{verb}} "{{quoted}}"', {
        quoted: params.quoted,
        verb: params.verb,
      })
    : params.verb;
  const mode = params.metadataMode ?? "when-quoted";
  const showMetadata =
    params.metadata &&
    (mode === "always" || (mode === "when-quoted" && params.quoted));
  return {
    displayLabel,
    ...(showMetadata ? { metadata: params.metadata } : {}),
  };
}

function verbForAction(action: string, s: Say): string {
  const normalized = action.replace(/[_-]+/g, "").toLowerCase();
  const english = ACTION_VERB_MAP[normalized];
  return english ? s(`verb.${normalized}`, english) : titleCaseAction(action);
}

/** Whether the parsed action maps to a curated verb (vs. titlecase fallback). */
function isKnownActionVerb(action: string): boolean {
  const normalized = action.replace(/[_-]+/g, "").toLowerCase();
  return normalized in ACTION_VERB_MAP;
}

function readExecutePayloadInput(inputRecord: Record<string, unknown> | null) {
  if (!inputRecord) {
    return null;
  }
  const nested = inputRecord.input;
  if (isRecord(nested)) {
    return nested;
  }
  return inputRecord;
}

function resolveOperationTranscript(
  operationId: string,
  input: unknown,
  s: Say
): { displayLabel: string; metadata?: string } {
  const { action, scope } = parseOperationId(operationId);
  const verb = verbForAction(action, s);
  const payloadInput = isRecord(input) ? readExecutePayloadInput(input) : null;
  const quoted = readQuotedArg(payloadInput);
  // Unknown compound tool names (imported connectors, e.g.
  // deepwiki_read_wiki_structure) parse into a misleading last-two-words
  // split — show the full operation id as the descriptor so the row stays
  // identifiable. Curated verbs keep the compact scope descriptor.
  const metadata = isKnownActionVerb(action)
    ? (scope ?? undefined)
    : operationId;
  return formatTranscriptToolRow({
    verb,
    quoted: quoted ?? undefined,
    metadata,
    metadataMode: "always",
  });
}

const MASTRA_WRAPPER_TOOL_IDS = new Set([
  "engenty_tool_execute",
  "engenty_tools_context",
  "engenty_tools_describe",
  "engenty_tools_discover",
  "engenty_tools_modules",
  "engenty_tools_search",
  "invoke_frontend_tool",
  "requestDecision",
  "requestFeedback",
  "web_search",
]);

/** Catalog / frontend tool ids use `module_action` or legacy `module.action` shape. */
function isStructuredToolId(id: string): boolean {
  if (MASTRA_WRAPPER_TOOL_IDS.has(id)) {
    return false;
  }
  return id.includes(".") || id.includes("_");
}

function basenamePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

function readScalar(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function formatLineRange(input: Record<string, unknown> | null): string | null {
  if (!input) {
    return null;
  }
  const start = readScalar(input, [
    "startLine",
    "start_line",
    "fromLine",
    "from_line",
  ]);
  const end = readScalar(input, ["endLine", "end_line", "toLine", "to_line"]);
  if (start && end) {
    return `L${start}-${end}`;
  }
  if (start) {
    return `L${start}`;
  }
  return null;
}

function truncateCommandPreview(command: string): string {
  const oneLine = command.trim().replace(/\s+/g, " ");
  if (oneLine.length <= 96) {
    return oneLine;
  }
  return `${oneLine.slice(0, 95)}…`;
}

function resolveMastraWorkspaceToolDisplay(
  toolName: string,
  input: Record<string, unknown> | null,
  s: Say
): { displayLabel: string; metadata?: string } {
  const action = toolName.replace(/^mastra_workspace_/, "");
  const path = readString(input, ["path", "file", "filePath", "file_path"]);
  const basename = path ? basenamePath(path) : null;
  const lineRange = formatLineRange(input);
  const command = readString(input, ["command", "cmd"]);
  const query = readString(input, ["query", "pattern", "search", "glob"]);

  switch (action) {
    case "read_file":
      return {
        displayLabel: basename
          ? s("readNamed", "Read {{name}}", { name: basename })
          : s("readFile", "Read file"),
        metadata: lineRange ?? undefined,
      };
    case "write_file":
      return {
        displayLabel: basename
          ? s("wroteNamed", "Wrote {{name}}", { name: basename })
          : s("wroteFile", "Wrote file"),
      };
    case "execute_command":
      return {
        displayLabel: s("ranShell", "Ran shell command"),
        metadata: command ? truncateCommandPreview(command) : undefined,
      };
    case "list_files":
    case "list_dir":
      return {
        displayLabel: s("listedFiles", "Listed files"),
        metadata: path ? basenamePath(path) || path : undefined,
      };
    case "search_files":
    case "grep":
      return {
        displayLabel: s("searchedFiles", "Searched files"),
        metadata: query ?? basename ?? undefined,
      };
    default:
      return {
        displayLabel: humanizeToolId(action),
        metadata:
          basename ??
          (command ? truncateCommandPreview(command) : (query ?? undefined)),
      };
  }
}

/**
 * What was ASKED. Lives on the artifact — either still in `output` (the card is
 * unanswered, or the answer was patched into it) or in `input`, which is the
 * tool's own arguments and therefore survives when the result replaces the
 * output with a resolution payload.
 */
function readDecisionQuestion(input: unknown, output: unknown): string | null {
  for (const source of [output, input]) {
    if (!isRecord(source)) {
      continue;
    }
    const title = readString(source, ["title"]);
    if (title) {
      return title;
    }
  }
  return null;
}

function readDecisionResolutionLabel(output: unknown): string | null {
  if (!isRecord(output)) {
    // The native suspend resumes with a model-facing sentence, not a record.
    return readDecisionResumeAnswer(output);
  }
  const choiceLabel =
    typeof output.choice_label === "string" ? output.choice_label.trim() : "";
  if (choiceLabel) {
    return choiceLabel;
  }
  const choiceId =
    typeof output.choice_id === "string" ? output.choice_id.trim() : "";
  if (!choiceId) {
    return null;
  }
  const choices = output.choices;
  if (!Array.isArray(choices)) {
    return choiceId;
  }
  for (const choice of choices) {
    if (!isRecord(choice)) {
      continue;
    }
    if (choice.id === choiceId && typeof choice.label === "string") {
      return choice.label.trim() || choiceId;
    }
  }
  return choiceId;
}

export interface ResolveTranscriptToolDisplayInput {
  input?: unknown;
  output?: unknown;
  /** Word the step as still running ("Creating …") instead of done. */
  running?: boolean;
  toolName: string;
}

export interface ResolvedTranscriptToolDisplay {
  displayLabel: string;
  metadata?: string;
  resolvedToolName: string;
}

export function resolveTranscriptToolDisplay(
  params: ResolveTranscriptToolDisplayInput
): ResolvedTranscriptToolDisplay {
  const wireToolName = params.toolName.trim() || "tool";
  const inputRecord = isRecord(params.input) ? params.input : null;
  const s = params.running ? sayRunning : say;

  if (wireToolName === "invoke_frontend_tool") {
    const resolvedToolName =
      readString(inputRecord, ["tool_name", "name"]) ?? wireToolName;
    if (isStructuredToolId(resolvedToolName)) {
      const payloadInput = isRecord(inputRecord?.input)
        ? inputRecord.input
        : null;
      const { action, scope } = parseOperationId(resolvedToolName);
      const quoted = payloadInput ? readQuotedArg(payloadInput) : null;
      const row = formatTranscriptToolRow({
        verb: verbForAction(action, s),
        quoted: quoted ?? undefined,
        metadata: scope ?? undefined,
        metadataMode: "always",
      });
      return { resolvedToolName, ...row };
    }
    // Non-structured frontend tools (navigate, openDialog, focusField, …): still
    // surface the primary arg (path, dialog id, …) so the row isn't a bare verb.
    const payloadInput = isRecord(inputRecord?.input)
      ? inputRecord.input
      : inputRecord;
    const quoted = readQuotedArg(payloadInput);
    return {
      resolvedToolName,
      displayLabel: quoted
        ? `${humanizeToolId(resolvedToolName)}: "${quoted}"`
        : humanizeToolId(resolvedToolName),
    };
  }

  if (wireToolName === "engenty_tool_execute") {
    const resolvedToolName =
      readString(inputRecord, [...EXECUTE_ID_KEYS]) ?? wireToolName;
    if (isStructuredToolId(resolvedToolName)) {
      const row = resolveOperationTranscript(resolvedToolName, inputRecord, s);
      return { resolvedToolName, ...row };
    }
    return {
      resolvedToolName,
      displayLabel: s("ran", "Ran {{name}}", { name: resolvedToolName }),
    };
  }

  if (wireToolName === "engenty_tools_search") {
    const query = readString(inputRecord, ["query", "q", "search_query"]);
    const moduleId = readString(inputRecord, ["moduleId", "module_id"]);
    if (query) {
      const row = formatTranscriptToolRow({
        verb: s("verb.search", "Searched"),
        quoted: query,
        metadata: moduleId ?? undefined,
        metadataMode: "when-quoted",
      });
      return { resolvedToolName: wireToolName, ...row };
    }
    if (moduleId) {
      return {
        resolvedToolName: wireToolName,
        displayLabel: s("searchedModuleTools", "Searched {{module}} tools", {
          module: moduleId,
        }),
      };
    }
    return {
      resolvedToolName: wireToolName,
      displayLabel: s("searchedTools", "Searched tools"),
    };
  }

  if (wireToolName === "engenty_tools_discover") {
    const query =
      readString(inputRecord, ["request", "query", "q"]) ?? undefined;
    const moduleId = readString(inputRecord, ["moduleId", "module_id"]);
    if (query && moduleId) {
      const row = formatTranscriptToolRow({
        verb: s("verb.discover", "Discovered"),
        quoted: query,
        metadata: moduleId,
        metadataMode: "when-quoted",
      });
      return { resolvedToolName: wireToolName, ...row };
    }
    if (query) {
      return {
        resolvedToolName: wireToolName,
        displayLabel: s("discoveredFor", 'Discovered tools for "{{query}}"', {
          query,
        }),
      };
    }
    return {
      resolvedToolName: wireToolName,
      displayLabel: s("discoveredTools", "Discovered tools"),
    };
  }

  if (wireToolName === "engenty_tools_modules") {
    return {
      resolvedToolName: wireToolName,
      displayLabel: s("listedModules", "Listed modules"),
    };
  }

  if (wireToolName === "web_search") {
    const query = readString(inputRecord, ["query", "search_query", "q"]);
    return {
      resolvedToolName: wireToolName,
      displayLabel: query
        ? s("webSearchQuery", "Web search: {{query}}", { query })
        : s("webSearch", "Web search"),
    };
  }

  if (wireToolName === "requestDecision") {
    // A tool APPROVAL is not a decision — it only shares this tool name because
    // the gate rides the decision-artifact pipeline (see ag-ui/tool-approval.ts).
    // Calling its row "Decision needed" asked the reader to answer a question
    // nobody asked, and said nothing about the operation at stake.
    const approval = parseToolApprovalResolution(params.output);
    if (approval) {
      const [primary, ...rest] = approval.operationIds;
      return {
        resolvedToolName: wireToolName,
        ...formatTranscriptToolRow({
          verb: approval.approved
            ? say("verb.approved", "Approved")
            : say("verb.denied", "Denied"),
          quoted: primary,
          metadata:
            rest.length > 0
              ? say("more", "+{{count}} more", { count: rest.length })
              : undefined,
        }),
      };
    }
    if (isToolApprovalArtifactOutput(params.output)) {
      // Still open: the gate's own title ("Approve <operation>?") is the row.
      return {
        resolvedToolName: wireToolName,
        displayLabel:
          readToolApprovalArtifactTitle(params.output) ??
          say("approvalNeeded", "Approval needed"),
      };
    }
    // The row is about the QUESTION. Labelling it with the answer alone
    // ("Ja", "Approve") left a transcript entry nobody could place — and once
    // the resolution payload replaced the artifact in `output`, not even that
    // survived and every answered chooser collapsed to "Decision needed".
    const question = readDecisionQuestion(params.input, params.output);
    const resolvedLabel = readDecisionResolutionLabel(params.output);
    if (question) {
      return {
        resolvedToolName: wireToolName,
        displayLabel: question,
        ...(resolvedLabel ? { metadata: resolvedLabel } : {}),
      };
    }
    return {
      resolvedToolName: wireToolName,
      displayLabel: resolvedLabel ?? say("decisionNeeded", "Decision needed"),
    };
  }

  if (wireToolName === "requestFeedback") {
    const outputRecord = isRecord(params.output) ? params.output : null;
    const resolvedLabel =
      outputRecord && typeof outputRecord.feedback === "string"
        ? outputRecord.feedback.trim()
        : null;
    return {
      resolvedToolName: wireToolName,
      displayLabel:
        resolvedLabel ?? say("feedbackRequested", "Feedback requested"),
    };
  }

  if (wireToolName.startsWith("mastra_workspace_")) {
    const row = resolveMastraWorkspaceToolDisplay(wireToolName, inputRecord, s);
    return { resolvedToolName: wireToolName, ...row };
  }

  if (wireToolName.startsWith("agent-")) {
    const row = resolveAgentToolDisplay(wireToolName, params.running === true);
    return { resolvedToolName: wireToolName, ...row };
  }

  if (isStructuredToolId(wireToolName)) {
    const row = resolveOperationTranscript(wireToolName, inputRecord, s);
    return { resolvedToolName: wireToolName, ...row };
  }

  const quoted = readQuotedArg(inputRecord);
  if (quoted) {
    return {
      resolvedToolName: wireToolName,
      displayLabel: `${humanizeToolId(wireToolName)}: "${quoted}"`,
    };
  }

  return {
    resolvedToolName: wireToolName,
    displayLabel: s("ran", "Ran {{name}}", { name: wireToolName }),
  };
}

// Platform agents that never appear in a tenant's agent catalog, so nothing
// can publish a name for them.
const AGENT_ID_DISPLAY_NAMES: Record<string, string> = {
  engenty_cli: "CLI Agent",
  file_analyst: "File Analyst",
};

/**
 * A run hands us an agent ID, never a name. Prefer the name a surface has
 * actually loaded ({@link registerAgentDisplayNames}); the humanised id is the
 * last resort, and is what made a delegation read as "Inbox.Overview".
 */
export function resolveAgentDisplayName(agentId: string): string {
  return (
    readAgentDisplayName(agentId) ??
    AGENT_ID_DISPLAY_NAMES[agentId] ??
    humanizeSegment(agentId)
  );
}

function resolveAgentToolDisplay(
  wireToolName: string,
  running: boolean
): {
  displayLabel: string;
  metadata?: string;
} {
  const name = resolveAgentDisplayName(wireToolName.slice("agent-".length));
  return {
    displayLabel: running ? sayRunning("agentAsk", name, { name }) : name,
  };
}
