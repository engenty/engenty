import type { JsonValue } from "./json-value.js";
import { isJsonValue } from "./json-value.js";

export const AG_UI_OPEN_INTERRUPT_METADATA_KEY = "ag_ui_open_interrupt";

/**
 * CUSTOM AG-UI event name carrying a freshly-opened interrupt (the full
 * {@link AgUiOpenInterruptMetadata} as `value`). Emitted just before the
 * RUN_FINISHED interrupt outcome so the client can render the new approval
 * card immediately — the persisted session metadata only catches up after a
 * refetch, and until then it still names the PREVIOUS interrupt (which made
 * chained approvals re-show the already-answered card).
 */
export const ENGENTY_OPEN_INTERRUPT_EVENT = "engenty.open_interrupt";

/** Default TTL for open decision interrupts (ms). Human approvals may take days. */
export const AG_UI_OPEN_INTERRUPT_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * TTL for frontend-tool interrupts (ms). Matches the server's parked-run
 * window (session-park PARKED_TTL_MS): while the suspended run can still be
 * resumed, a returning browser may run the tool; past it, resume is impossible
 * anyway, so the interrupt fails as "couldn't resolve" instead of spinning
 * for days.
 */
export const AG_UI_FRONTEND_TOOL_INTERRUPT_TTL_MS = 15 * 60 * 1000;

/**
 * How long the browser waits for a frontend-tool handler to settle before
 * resuming with a "couldn't resolve" failure. Deliberately shorter than the
 * interrupt TTL: it bounds a hung/missing executor, not the user's absence.
 */
export const AG_UI_FRONTEND_TOOL_EXECUTION_TIMEOUT_MS = 3 * 60 * 1000;

/** TTL for the interrupt kind: short for browser frontend tools, long otherwise. */
export function agUiOpenInterruptTtlMsForKind(
  // Optional to match AgUiOpenInterruptMetadata.kind — an absent kind already
  // resolves to the default TTL below.
  kind?: AgUiOpenInterruptKind
): number {
  return kind === "frontend_tool"
    ? AG_UI_FRONTEND_TOOL_INTERRUPT_TTL_MS
    : AG_UI_OPEN_INTERRUPT_DEFAULT_TTL_MS;
}

export type AgUiOpenInterruptKind =
  | "decision"
  | "feedback"
  | "frontend_tool"
  | "sandbox_command";

export interface AgUiOpenInterruptChoice {
  description?: string;
  id: string;
  label: string;
}

export interface AgUiOpenInterruptMetadata {
  artifact_id: string;
  body?: string;
  choices?: AgUiOpenInterruptChoice[];
  /**
   * The effort tier the suspending run resolved to.
   *
   * A suspended turn is answered by a SECOND run, which re-resolves its own
   * model. Without this the resume resolves with no effort at all and falls
   * through to the `chat` purpose (`model.medium`) — so a question asked at
   * `low` came back answered by a different model than the one that asked it.
   * Carried here because the open interrupt is already the only thing joining
   * the two runs.
   *
   * The tier, not the model id: re-deriving through the role binding preserves
   * the gateway, the tenant layer and governance clamping, none of which
   * survive pinning a bare model id.
   *
   * Mirrors ai-core's `AiEffort`, inlined to keep this package dependency-free.
   */
  effort?: "high" | "low" | "medium";
  /** ISO-8601 expiry; resume rejected after this instant. */
  expires_at?: string;
  interrupt_id: string;
  kind?: AgUiOpenInterruptKind;
  /** Decision interrupts only: render checkboxes and accept several choices. */
  multi_select?: boolean;
  /** Suspended Mastra run id — reused on resume so the snapshot reloads (native suspend/resume). */
  run_id?: string;
  title: string;
  tool_call_id: string;
  tool_input?: JsonValue;
  tool_name?: string;
}

function readOpenInterruptChoices(
  raw: unknown
): AgUiOpenInterruptChoice[] | undefined {
  if (!Array.isArray(raw)) {
    return;
  }
  const choices = raw.flatMap((choice) => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      return [];
    }
    const record = choice as {
      description?: unknown;
      id?: unknown;
      label?: unknown;
    };
    if (typeof record.id !== "string" || typeof record.label !== "string") {
      return [];
    }
    return [
      {
        id: record.id,
        label: record.label,
        ...(typeof record.description === "string" && record.description.trim()
          ? { description: record.description.trim() }
          : {}),
      },
    ];
  });
  return choices.length > 0 ? choices : undefined;
}

function readOpenInterruptKind(
  raw: unknown,
  choices: AgUiOpenInterruptChoice[] | undefined,
  toolName: unknown
): AgUiOpenInterruptKind {
  if (
    raw === "frontend_tool" ||
    raw === "decision" ||
    raw === "feedback" ||
    raw === "sandbox_command"
  ) {
    return raw;
  }
  if (typeof toolName === "string" && toolName.trim()) {
    return "frontend_tool";
  }
  if (choices?.length) {
    return "decision";
  }
  return "decision";
}

export function readAgUiOpenInterrupt(
  metadata: Record<string, unknown> | null | undefined
): AgUiOpenInterruptMetadata | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const raw = metadata[AG_UI_OPEN_INTERRUPT_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const interruptId = record.interrupt_id;
  const toolCallId = record.tool_call_id;
  const artifactId = record.artifact_id;
  const title = record.title;
  const expiresAt = record.expires_at;
  const body = record.body;
  const choices = readOpenInterruptChoices(record.choices);
  const toolName = record.tool_name;
  const toolInput = record.tool_input;
  const runId = record.run_id;
  const effort = record.effort;
  if (
    typeof interruptId !== "string" ||
    typeof toolCallId !== "string" ||
    typeof artifactId !== "string" ||
    typeof title !== "string"
  ) {
    return null;
  }
  const kind = readOpenInterruptKind(record.kind, choices, toolName);
  if (
    kind === "frontend_tool" &&
    (typeof toolName !== "string" || !toolName.trim())
  ) {
    return null;
  }
  return {
    artifact_id: artifactId,
    ...(typeof body === "string" && body.trim() ? { body: body.trim() } : {}),
    ...(choices ? { choices } : {}),
    ...(effort === "low" || effort === "medium" || effort === "high"
      ? { effort }
      : {}),
    ...(record.multi_select === true ? { multi_select: true } : {}),
    ...(typeof expiresAt === "string" && expiresAt.trim()
      ? { expires_at: expiresAt.trim() }
      : {}),
    interrupt_id: interruptId,
    kind,
    ...(typeof runId === "string" && runId.trim()
      ? { run_id: runId.trim() }
      : {}),
    title,
    tool_call_id: toolCallId,
    ...(typeof toolName === "string" && toolName.trim()
      ? { tool_name: toolName.trim() }
      : {}),
    ...(toolInput !== undefined && isJsonValue(toolInput)
      ? { tool_input: toolInput }
      : {}),
  };
}

/** Parse the open interrupt from a CUSTOM `engenty.open_interrupt` event value. */
export function readAgUiOpenInterruptEventValue(
  value: unknown
): AgUiOpenInterruptMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return readAgUiOpenInterrupt({ [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: value });
}

export function isFrontendToolOpenInterrupt(
  open: AgUiOpenInterruptMetadata
): boolean {
  return open.kind === "frontend_tool";
}

export function isDecisionOpenInterrupt(
  open: AgUiOpenInterruptMetadata
): boolean {
  return (
    open.kind !== "frontend_tool" &&
    open.kind !== "sandbox_command" &&
    open.kind !== "feedback"
  );
}

export function isFeedbackOpenInterrupt(
  open: AgUiOpenInterruptMetadata
): boolean {
  return open.kind === "feedback";
}

export function isSandboxCommandOpenInterrupt(
  open: AgUiOpenInterruptMetadata
): boolean {
  return open.kind === "sandbox_command";
}

export function buildSandboxCommandOpenInterrupt(params: {
  artifact_id: string;
  body?: string;
  interrupt_id: string;
  run_id?: string;
  title: string;
  tool_call_id: string;
  tool_input?: JsonValue;
  tool_name: string;
  expires_at?: string;
}): AgUiOpenInterruptMetadata {
  return {
    artifact_id: params.artifact_id,
    ...(params.body ? { body: params.body } : {}),
    interrupt_id: params.interrupt_id,
    kind: "sandbox_command",
    ...(params.run_id ? { run_id: params.run_id } : {}),
    title: params.title,
    tool_call_id: params.tool_call_id,
    tool_name: params.tool_name,
    ...(params.tool_input === undefined
      ? {}
      : { tool_input: params.tool_input }),
    ...(params.expires_at ? { expires_at: params.expires_at } : {}),
  };
}

export function buildFrontendToolOpenInterrupt(params: {
  artifact_id: string;
  interrupt_id: string;
  title: string;
  tool_call_id: string;
  tool_input?: JsonValue;
  tool_name: string;
  expires_at?: string;
  /** Suspended Mastra run id — persisted so resume reloads the snapshot natively. */
  run_id?: string;
}): AgUiOpenInterruptMetadata {
  return {
    artifact_id: params.artifact_id,
    interrupt_id: params.interrupt_id,
    kind: "frontend_tool",
    title: params.title,
    tool_call_id: params.tool_call_id,
    tool_name: params.tool_name,
    ...(params.tool_input === undefined
      ? {}
      : { tool_input: params.tool_input }),
    ...(params.run_id ? { run_id: params.run_id } : {}),
    ...(params.expires_at ? { expires_at: params.expires_at } : {}),
  };
}

export function isAgUiOpenInterruptExpired(
  open: AgUiOpenInterruptMetadata,
  nowMs: number = Date.now()
): boolean {
  const expiresAt = open.expires_at;
  if (!expiresAt) {
    return false;
  }
  const expiresMs = Date.parse(expiresAt);
  return Number.isFinite(expiresMs) && nowMs > expiresMs;
}

export function buildAgUiOpenInterruptExpiresAt(
  nowMs: number = Date.now(),
  ttlMs: number = AG_UI_OPEN_INTERRUPT_DEFAULT_TTL_MS
): string {
  return new Date(nowMs + ttlMs).toISOString();
}
