/**
 * Message-part guards aligned with ui-core `copilot-message-parts.ts` —
 * keep in sync when copilot adds new part kinds.
 */
import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import type {
  AgentRunOutcomeState,
  AgentRunStatus,
  AgentStatusStep,
  AgentStatusTickerSnapshot,
  AgentStepKind,
  DeriveAgentStatusTickerInput,
} from "./types.js";

const AGENT_STATUS_TICKER_MAX_RECENT_STEPS = 5;

interface ToolPartLike {
  input?: unknown;
  output?: unknown;
  state?: string;
  toolName?: string;
  type: string;
}

function isToolPart(part: unknown): part is ToolPartLike {
  if (!part || typeof part !== "object") {
    return false;
  }
  const type = (part as { type?: unknown }).type;
  return (
    typeof type === "string" &&
    (type === "dynamic-tool" || type.startsWith("tool-"))
  );
}

function getToolName(part: ToolPartLike): string {
  if (part.type === "dynamic-tool" && part.toolName) {
    return part.toolName;
  }
  return part.type.replace(/^tool-/, "");
}

function getToolState(
  part: ToolPartLike
): "pending" | "running" | "completed" | "error" {
  switch (part.state) {
    case "approval-requested":
      return "pending";
    case "input-streaming":
    case "input-available":
      return "running";
    case "output-available":
      return "completed";
    case "output-error":
    case "input-error":
      return "error";
    default:
      return "running";
  }
}

export function getLastAssistantMessage(
  messages: readonly AgentTurnMessageLike[]
): AgentTurnMessageLike | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "assistant") {
      return m;
    }
  }
  return null;
}

function summarizeActivityPart(part: unknown): string {
  if (!part || typeof part !== "object") {
    return "unknown";
  }
  const record = part as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "unknown";
  if (type === "text") {
    return `text:${String(record.text ?? "").length}`;
  }
  if (type === "reasoning") {
    return `reasoning:${String(record.text ?? "").length}`;
  }
  if (type === "dynamic-tool" || type.startsWith("tool-")) {
    const toolCallId = String(record.toolCallId ?? record.tool_call_id ?? "");
    const state = String(record.state ?? "");
    const toolName = String(record.toolName ?? type);
    return `tool:${toolCallId}:${toolName}:${state}`;
  }
  if (type === "data-copilot-progress") {
    return `progress:${JSON.stringify(record.data ?? null)}`;
  }
  return type;
}

/** Fingerprint of the latest assistant turn — used to detect new run activity. */
export function buildAssistantActivitySignature(
  messages: readonly AgentTurnMessageLike[]
): string {
  const lastAssistant = getLastAssistantMessage(messages);
  if (!lastAssistant?.parts?.length) {
    return "";
  }
  return lastAssistant.parts
    .map((part) => summarizeActivityPart(part))
    .join("|");
}

function shouldSuppressStaleAssistantSteps(
  input: DeriveAgentStatusTickerInput
) {
  const baseline = input.activityBaselineSignature;
  if (baseline == null) {
    return false;
  }
  if (input.chatStatus !== "submitted" && input.chatStatus !== "streaming") {
    return false;
  }
  return buildAssistantActivitySignature(input.messages) === baseline;
}

function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toolLabel(part: ToolPartLike): string {
  const name = getToolName(part);
  const st = getToolState(part);
  if (st === "completed") {
    return `${name} · done`;
  }
  if (st === "error") {
    return `${name} · error`;
  }
  if (st === "pending") {
    return `${name} · pending`;
  }
  return `${name} · …`;
}

/**
 * The composer status flap shows run state only — tool steps — and never
 * repeats transcript text or reasoning, which the transcript already shows.
 */
function stepFromPart(part: unknown): AgentStatusStep | null {
  if (!isToolPart(part)) {
    return null;
  }
  // Interactive HITL tools (decision/feedback) are their own docked surface —
  // don't echo them in the composer status flap (avoids a duplicate "widget").
  const toolName = getToolName(part);
  if (toolName === "requestDecision" || toolName === "requestFeedback") {
    return null;
  }
  return {
    kind: "tool",
    label: normalizeSingleLine(toolLabel(part)),
    fullLabel: toolLabel(part),
  };
}

function collectRecentStepsFromParts(
  parts: readonly unknown[],
  maxSteps = AGENT_STATUS_TICKER_MAX_RECENT_STEPS
): AgentStatusStep[] {
  const list = Array.isArray(parts) ? parts : [];
  const steps: AgentStatusStep[] = [];
  for (let i = list.length - 1; i >= 0 && steps.length < maxSteps; i--) {
    const step = stepFromPart(list[i]);
    if (step) {
      steps.push(step);
    }
  }
  return steps;
}

function terminalRunError(status: AgentRunStatus | null | undefined) {
  return (
    status === "failed" || status === "cancelled" || status === "timed_out"
  );
}

function deriveOutcome(
  input: DeriveAgentStatusTickerInput
): AgentRunOutcomeState {
  if (input.stale) {
    return "stale";
  }
  if (input.errorMessage?.trim() || input.chatStatus === "error") {
    return "error";
  }
  if (terminalRunError(input.runStatus ?? null)) {
    return "error";
  }
  if (input.chatStatus === "ready") {
    if (
      input.runStatus === "running" ||
      input.runStatus === "queued" ||
      input.runStatus === "waiting_for_approval" ||
      input.runStatus === "waiting_for_input"
    ) {
      return "running";
    }
    return "success";
  }
  if (
    input.chatStatus === "submitted" &&
    !getLastAssistantMessage(input.messages)
  ) {
    return "requested";
  }
  return "running";
}

function uiHints(
  outcome: AgentRunOutcomeState
): Pick<AgentStatusTickerSnapshot, "variant" | "showSpinner"> {
  if (outcome === "error") {
    return { variant: "destructive", showSpinner: false };
  }
  if (outcome === "stale") {
    return { variant: "muted", showSpinner: false };
  }
  if (outcome === "success") {
    return { variant: "success", showSpinner: false };
  }
  if (outcome === "requested") {
    return { variant: "muted", showSpinner: true };
  }
  return { variant: "active", showSpinner: outcome === "running" };
}

export function deriveAgentStatusTicker(
  input: DeriveAgentStatusTickerInput
): AgentStatusTickerSnapshot {
  const { labels } = input;
  const outcome = deriveOutcome(input);

  const lastAssistant = getLastAssistantMessage(input.messages);
  const parts = lastAssistant?.parts ?? [];
  const suppressStaleSteps = shouldSuppressStaleAssistantSteps(input);
  const recentSteps = suppressStaleSteps
    ? []
    : collectRecentStepsFromParts(parts as unknown[]);
  const step = recentSteps[0] ?? null;

  const stepKind: AgentStepKind = step?.kind ?? "idle";
  let label = step?.label ?? "";
  let fullLabel = step?.fullLabel ?? "";

  if (!step) {
    if (outcome === "error") {
      const msg =
        input.errorMessage?.trim() ||
        (input.chatStatus === "error" ? labels.somethingWentWrong : "");
      label = msg || labels.error;
      fullLabel = label;
    } else if (
      input.chatStatus === "submitted" ||
      input.chatStatus === "streaming"
    ) {
      label = lastAssistant ? labels.thinking : labels.waiting;
      fullLabel = label;
    } else if (outcome === "success") {
      label = labels.done;
      fullLabel = label;
    } else if (outcome === "stale") {
      label = labels.stale;
      fullLabel = label;
    } else {
      label = labels.waiting;
      fullLabel = label;
    }
  }

  const hints = uiHints(outcome);
  const normalizedLabel = normalizeSingleLine(label);
  const normalizedFullLabel =
    normalizeSingleLine(fullLabel) || fullLabel.trim();

  return {
    canExpandSteps:
      recentSteps.length > 1 ||
      (step != null && normalizedFullLabel !== normalizedLabel),
    outcome,
    recentSteps,
    stepKind,
    label: normalizedLabel,
    fullLabel: normalizedFullLabel,
    variant: hints.variant,
    showSpinner: hints.showSpinner,
  };
}
