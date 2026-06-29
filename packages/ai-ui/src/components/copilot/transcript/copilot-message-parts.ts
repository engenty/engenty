/** Message part type guards and helpers for copilot transcript rendering. */

export interface ToolPartLike {
  displayLabel?: string;
  errorText?: string;
  input?: unknown;
  metadata?: string;
  output?: unknown;
  progressLines?: string[];
  resolvedToolName?: string;
  state?: string;
  toolCallId?: string;
  toolName?: string;
  type: string;
}

export interface ReasoningPartLike {
  state?: string;
  text?: string;
  type: string;
}

export interface ProgressEventLike {
  agent_id?: string;
  agentId?: string;
  confidence?: number;
  error?: string;
  latency_ms?: number;
  run_id?: string;
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

export interface ProgressPartLike {
  data?: ProgressEventLike;
  type: "data-copilot-progress";
}

export function isToolPart(part: unknown): part is ToolPartLike {
  if (!part || typeof part !== "object") {
    return false;
  }
  const type = (part as { type?: unknown }).type;
  return (
    typeof type === "string" &&
    (type === "dynamic-tool" || type.startsWith("tool-"))
  );
}

export function isReasoningPart(part: unknown): part is ReasoningPartLike {
  if (!part || typeof part !== "object") {
    return false;
  }
  return (part as { type?: unknown }).type === "reasoning";
}

export function isProgressPart(part: unknown): part is ProgressPartLike {
  if (!part || typeof part !== "object") {
    return false;
  }
  return (part as { type?: unknown }).type === "data-copilot-progress";
}

export function getToolName(part: ToolPartLike): string {
  const explicitName = part.toolName?.trim();
  if (explicitName) {
    return explicitName;
  }
  const inferredName = part.type.replace(/^tool-/, "");
  if (inferredName === "invocation") {
    return "";
  }
  return inferredName;
}

export function getToolState(
  part: ToolPartLike
): "pending" | "running" | "completed" | "error" {
  if (part.errorText?.trim()) {
    return "error";
  }
  if (
    part.output !== undefined &&
    part.state !== "output-error" &&
    part.state !== "input-error"
  ) {
    return "completed";
  }
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

export function getToolDisplayLabel(
  part: ToolPartLike,
  toolName: string
): string {
  const explicit = part.displayLabel?.trim();
  if (explicit) {
    return explicit;
  }
  const resolved = part.resolvedToolName?.trim();
  if (resolved && resolved !== toolName) {
    return resolved;
  }
  return toolName;
}

export function getToolResolvedName(
  part: ToolPartLike,
  toolName: string
): string {
  return part.resolvedToolName?.trim() || toolName;
}

/** Sync Mastra supervisor delegations (`agent-engenty_*`) — not generic tool-invocation rows. */
export function isSubAgentDelegationTool(
  part: ToolPartLike,
  toolName: string
): boolean {
  const resolved = getToolResolvedName(part, toolName);
  return toolName.startsWith("agent-") || resolved.startsWith("agent-");
}

export function getProgressLabel(event: ProgressEventLike): string | undefined {
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
