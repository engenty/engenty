/**
 * Message-part guards aligned with ui-core `copilot-message-parts.ts` —
 * keep in sync when copilot adds new part kinds.
 */
import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import type {
  AgentRunOutcomeState,
  AgentRunStatus,
  AgentStatusStep,
  AgentStatusTickerLabels,
  AgentStatusTickerSnapshot,
  AgentStepKind,
  AgentTurnPhase,
  DeriveAgentStatusTickerInput,
} from "./types.js";

export const AGENT_STATUS_TICKER_MAX_RECENT_STEPS = 5;

interface ToolPartLike {
  input?: unknown;
  output?: unknown;
  state?: string;
  toolName?: string;
  type: string;
}

interface ProgressEventLike {
  agent_id?: string;
  agentId?: string;
  confidence?: number;
  error?: string;
  tool_name?: string;
  type:
    | "run.started"
    | "context.loaded"
    | "coordinator.decision"
    | "tool.started"
    | "tool.finished"
    | "run.completed"
    | "run.failed";
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

function isProgressPart(part: unknown): boolean {
  if (!part || typeof part !== "object") {
    return false;
  }
  return (part as { type?: unknown }).type === "data-copilot-progress";
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

function getProgressLabel(event: ProgressEventLike): string | undefined {
  switch (event.type) {
    case "coordinator.decision": {
      const agent = event.agent_id ?? event.agentId ?? "unknown";
      const conf = event.confidence;
      if (conf == null) {
        return agent;
      }
      return `${agent} · ${(conf * 100).toFixed(0)}%`;
    }
    case "tool.started":
    case "tool.finished":
      return event.tool_name;
    case "run.failed":
      return event.error;
    default:
      return;
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

const REASONING_PREFIX = "Reasoning";

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

function stepFromPart(
  part: unknown,
  statusOnly: boolean
): AgentStatusStep | null {
  if (typeof part !== "object" || !part) {
    return null;
  }
  const typed = part as { type?: string; text?: string; data?: unknown };

  if (isToolPart(part)) {
    // Interactive HITL tools (decision/feedback) are their own docked surface —
    // don't echo them in the composer status flap (avoids a duplicate "widget").
    const toolName = getToolName(part as ToolPartLike);
    if (toolName === "requestDecision" || toolName === "requestFeedback") {
      return null;
    }
    return {
      kind: "tool",
      label: normalizeSingleLine(toolLabel(part as ToolPartLike)),
      fullLabel: toolLabel(part as ToolPartLike),
    };
  }
  if (statusOnly) {
    return null;
  }
  if (typed.type === "text" && typeof typed.text === "string") {
    const raw = typed.text.trim();
    if (raw.length > 0) {
      const single = normalizeSingleLine(raw);
      return {
        kind: "text",
        label: single,
        fullLabel: raw,
      };
    }
  }
  if (typed.type === "reasoning" && typeof typed.text === "string") {
    const raw = typed.text.trim();
    if (raw.length > 0) {
      const single = normalizeSingleLine(raw);
      const short = single.length > 120 ? `${single.slice(0, 117)}…` : single;
      return {
        kind: "reasoning",
        label: `${REASONING_PREFIX}: ${short}`,
        fullLabel: `${REASONING_PREFIX}\n${raw}`,
      };
    }
  }
  if (isProgressPart(part)) {
    const data = (part as { data?: ProgressEventLike }).data;
    if (data && typeof data === "object") {
      const lbl = getProgressLabel(data);
      if (lbl?.trim()) {
        const s = normalizeSingleLine(lbl);
        return { kind: "progress", label: s, fullLabel: lbl.trim() };
      }
    }
  }
  return null;
}

export function collectRecentStepsFromParts(
  parts: readonly unknown[],
  statusOnly: boolean,
  maxSteps = AGENT_STATUS_TICKER_MAX_RECENT_STEPS
): AgentStatusStep[] {
  const list = Array.isArray(parts) ? parts : [];
  const steps: AgentStatusStep[] = [];
  for (let i = list.length - 1; i >= 0 && steps.length < maxSteps; i--) {
    const step = stepFromPart(list[i], statusOnly);
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

function deriveTurnPhase(
  input: DeriveAgentStatusTickerInput,
  outcome: AgentRunOutcomeState
): AgentTurnPhase {
  if (outcome === "success" || outcome === "error") {
    return "run_end";
  }
  if (outcome === "stale") {
    return "turn_end";
  }
  if (outcome === "requested") {
    return "requested";
  }
  const lastAssistant = getLastAssistantMessage(input.messages);
  if (input.chatStatus === "submitted" && lastAssistant) {
    return "run_start";
  }
  if (input.chatStatus === "streaming") {
    return "turn_start";
  }
  return "turn_start";
}

function uiHints(
  outcome: AgentRunOutcomeState,
  stepKind: AgentStepKind
): Pick<AgentStatusTickerSnapshot, "variant" | "showSpinner" | "showShimmer"> {
  if (outcome === "error") {
    return { variant: "destructive", showSpinner: false, showShimmer: false };
  }
  if (outcome === "stale") {
    return { variant: "muted", showSpinner: false, showShimmer: false };
  }
  if (outcome === "success") {
    return { variant: "success", showSpinner: false, showShimmer: false };
  }
  if (outcome === "requested") {
    return { variant: "muted", showSpinner: true, showShimmer: false };
  }
  const running = outcome === "running";
  const shimmer = running && (stepKind === "text" || stepKind === "reasoning");
  return {
    variant: "active",
    showSpinner: running && !shimmer,
    showShimmer: shimmer,
  };
}

const DEFAULT_LABELS: Required<AgentStatusTickerLabels> = {
  collapseSteps: "Hide recent steps",
  expandSteps: "Show recent steps",
  thinking: "Thinking…",
  waiting: "Waiting…",
};

export function deriveAgentStatusTicker(
  input: DeriveAgentStatusTickerInput
): AgentStatusTickerSnapshot {
  const labels = { ...DEFAULT_LABELS, ...input.labels };
  const outcome = deriveOutcome(input);
  const phase = deriveTurnPhase(input, outcome);

  const lastAssistant = getLastAssistantMessage(input.messages);
  const parts = lastAssistant?.parts ?? [];
  const statusOnly = input.statusOnly === true;
  const suppressStaleSteps = shouldSuppressStaleAssistantSteps(input);
  const recentSteps = suppressStaleSteps
    ? []
    : collectRecentStepsFromParts(parts as unknown[], statusOnly);
  const step = recentSteps[0] ?? null;

  const stepKind: AgentStepKind = step?.kind ?? "idle";
  let label = step?.label ?? "";
  let fullLabel = step?.fullLabel ?? "";

  if (!step) {
    if (outcome === "error") {
      const msg =
        input.errorMessage?.trim() ||
        (input.chatStatus === "error" ? "Something went wrong." : "");
      label = msg || "Error";
      fullLabel = label;
    } else if (
      input.chatStatus === "submitted" ||
      input.chatStatus === "streaming"
    ) {
      label = lastAssistant ? labels.thinking : labels.waiting;
      fullLabel = label;
    } else if (outcome === "success") {
      label = "Done";
      fullLabel = label;
    } else if (outcome === "stale") {
      label = "Stale";
      fullLabel = label;
    } else {
      label = labels.waiting;
      fullLabel = label;
    }
  }

  const hints = uiHints(outcome, stepKind);
  const normalizedLabel = normalizeSingleLine(label);
  const normalizedFullLabel =
    normalizeSingleLine(fullLabel) || fullLabel.trim();

  return {
    canExpandSteps:
      recentSteps.length > 1 ||
      (step != null && normalizedFullLabel !== normalizedLabel),
    phase,
    outcome,
    recentSteps,
    stepKind,
    label: normalizedLabel,
    fullLabel: normalizedFullLabel,
    variant: hints.variant,
    showSpinner: hints.showSpinner,
    showShimmer: hints.showShimmer,
  };
}
