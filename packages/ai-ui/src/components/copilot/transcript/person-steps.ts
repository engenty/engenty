// Person-facing words for what an agent is doing: the turn's live status line
// and, afterwards, one summary of the work. Developer mode keeps the raw step
// list; here a curl loop is "Ruft www.waff.at ab" and 33 tool calls are
// "12 Seiten abgerufen, 5 Dateien gelesen".
//
// Steps that are the agent's own bookkeeping (skills, tool discovery) return
// null and stay silent; a step with a clip is drawn as that clip instead.
import { resolveTranscriptToolDisplay } from "../../../ag-ui/resolve-transcript-tool-display.js";
import {
  getToolName,
  getToolResolvedName,
  getToolState,
  isToolPart,
  type ToolPartLike,
} from "./copilot-message-parts";
import { readToolInput } from "./tool-clips.js";

export const PERSON_STEP_KINDS = [
  "fetch",
  "browse",
  "look",
  "act",
  "search",
  "read",
  "write",
  "run",
  "other",
] as const;

export type PersonStepKind = (typeof PERSON_STEP_KINDS)[number];

export interface PersonStep {
  kind: PersonStepKind;
  /** `other` only: the developer resolver's wording. */
  label?: string;
  /** A host, file name or query — what the step was about. */
  target?: string;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

const URL_RE = /https?:\/\/[^\s"'\\)<>]+/g;
const FILE_TOOL_KINDS: Record<string, PersonStepKind> = {
  edit_file: "write",
  grep: "read",
  list_dir: "read",
  list_files: "read",
  read_file: "read",
  search_files: "read",
  write_file: "write",
};
const SILENT_TOOL_PREFIXES = [
  "engenty_tools_",
  "skill",
  "requestDecision",
  // Credential and hand-over tools park on their own card.
  "browser_request_",
  "browser_sign_in",
  "browser_credentials",
  "browser_hand_over",
  "browser_start",
];
// Browser tools that only read the page; the rest of `browser_*` acts on it.
const BROWSER_LOOK_TOOLS = new Set([
  "browser_evaluate",
  "browser_parse",
  "browser_screenshot",
  "browser_show",
  "browser_snapshot",
  "browser_tabs",
  "browser_view",
]);
const GOAL_PREVIEW_CHARS = 80;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** The first host a shell command talks to, with how many others follow. */
function commandHost(command: string): string {
  const hosts = [...new Set((command.match(URL_RE) ?? []).map(hostOf))].filter(
    Boolean
  );
  const [first] = hosts;
  if (!first) {
    return "";
  }
  return hosts.length > 1 ? `${first} (+${hosts.length - 1})` : first;
}

function basename(path: string): string {
  return path.replace(/\/+$/, "").split("/").at(-1) ?? path;
}

/** What a tool call is, in a person's terms; null when it stays silent. */
export function describePersonStep(
  part: ToolPartLike,
  toolName = getToolName(part)
): PersonStep | null {
  const name = getToolResolvedName(part, toolName);
  if (SILENT_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return null;
  }
  const input = readToolInput(part);
  if (name.includes("web_search") || name.includes("websearch")) {
    const query = text(input.query) || text(input.q);
    return { kind: "search", ...(query ? { target: query } : {}) };
  }
  if (name.startsWith("browser_")) {
    if (name === "browser_goto") {
      const host = hostOf(text(input.url));
      return { kind: "browse", ...(host ? { target: host } : {}) };
    }
    if (BROWSER_LOOK_TOOLS.has(name)) {
      return { kind: "look" };
    }
    // `browser_run_fast` carries its sub-goal in words a person can read.
    const goal = text(input.goal).replace(/\s+/g, " ");
    return {
      kind: "act",
      ...(goal
        ? {
            target:
              goal.length > GOAL_PREVIEW_CHARS
                ? `${goal.slice(0, GOAL_PREVIEW_CHARS - 1)}…`
                : goal,
          }
        : {}),
    };
  }
  if (name.startsWith("mastra_workspace_")) {
    const action = name.replace("mastra_workspace_", "");
    if (action === "execute_command") {
      const command = text(input.command);
      const host = commandHost(command);
      return /\b(curl|wget)\b/.test(command) || host
        ? { kind: "fetch", ...(host ? { target: host } : {}) }
        : { kind: "run" };
    }
    const kind = FILE_TOOL_KINDS[action];
    if (kind) {
      const path = text(input.path) || text(input.file_path);
      return { kind, ...(path ? { target: basename(path) } : {}) };
    }
  }
  const label = resolveTranscriptToolDisplay({
    input: part.input,
    output: part.output,
    toolName: name,
  }).displayLabel;
  return { kind: "other", label };
}

/** "Ruft www.waff.at ab" — the step in progress, for the status line. */
export function personStepText(
  t: Translate,
  step: PersonStep,
  tense: "running" | "done"
): string {
  if (step.kind === "other") {
    return step.label ?? "";
  }
  const key = `personStep.${tense}.${step.kind}${step.target ? "" : "Bare"}`;
  return t(key, { target: step.target });
}

/**
 * The status line for a turn that is between or inside tool calls: the newest
 * part is a tool call, so say what it is. Null when the newest part is not a
 * tool call, so the caller's "thinking" wording applies.
 */
export function personStepStatusLabel(
  parts: readonly unknown[] | undefined,
  t: Translate
): string | null {
  const last = parts?.at(-1);
  if (!isToolPart(last)) {
    return null;
  }
  const state = getToolState(last);
  if (state === "error") {
    return null;
  }
  const step = describePersonStep(last);
  return step ? personStepText(t, step, "running") || null : null;
}

/** "12 Seiten abgerufen, 5 Dateien gelesen" — the finished work, counted. */
export function summarizePersonSteps(
  steps: readonly PersonStep[],
  t: Translate
): string {
  return PERSON_STEP_KINDS.flatMap((kind) => {
    const count = steps.filter((step) => step.kind === kind).length;
    return count > 0 ? [t(`personStep.summary.${kind}`, { count })] : [];
  }).join(", ");
}
