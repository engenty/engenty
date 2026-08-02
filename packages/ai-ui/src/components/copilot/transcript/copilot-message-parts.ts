/** Message part type guards and helpers for copilot transcript rendering. */

import {
  readA2uiRenderMeta,
  readObjectRenderMeta,
} from "@engenty/ai-core/browser";
import { readMcpAppMeta } from "../tool-call/mcp-app-tool-call-card.js";

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

/**
 * Object-render tool parts (`show_objects`, or any tool output carrying the
 * object_render marker) render as full-width object cards. Like sub-agent
 * delegations, they must escape the collapsed tool timeline — a contact list
 * folded into a one-line "Used N tools" step is not a rendered object.
 */
export function isObjectRenderToolPart(
  part: ToolPartLike,
  toolName: string
): boolean {
  const resolved = getToolResolvedName(part, toolName);
  return (
    toolName === "show_objects" ||
    resolved === "show_objects" ||
    readObjectRenderMeta(part.output) !== null
  );
}

/**
 * A2UI surface tool parts (`show_ui`, or any tool output carrying the a2ui
 * marker) render as full-width native surfaces — same escape from the
 * collapsed tool timeline as object renders.
 */
export function isA2uiToolPart(part: ToolPartLike, toolName: string): boolean {
  const resolved = getToolResolvedName(part, toolName);
  return (
    toolName === "show_ui" ||
    resolved === "show_ui" ||
    readA2uiRenderMeta(part.output) !== null
  );
}

/**
 * MCP App widget tool parts (`show_widget`, external MCP app tools carrying
 * the mcp_app marker with a template) render as full-width sandboxed frames —
 * a widget folded into a one-line timeline step is not a rendered widget.
 */
export function isMcpAppWidgetToolPart(
  part: ToolPartLike,
  toolName: string
): boolean {
  const resolved = getToolResolvedName(part, toolName);
  return (
    toolName === "show_widget" ||
    resolved === "show_widget" ||
    readMcpAppMeta(part.output)?.html !== undefined
  );
}

/**
 * Connect-request tool parts (`connections_request_connect`) render as the
 * full-width in-chat connect card (registered by the connections module) —
 * same escape from the collapsed tool timeline as object renders: a connect
 * button folded into a one-line "Used N tools" step is unusable.
 */
export function isConnectRequestToolPart(
  part: ToolPartLike,
  toolName: string
): boolean {
  const resolved = getToolResolvedName(part, toolName);
  return (
    toolName === "connections_request_connect" ||
    resolved === "connections_request_connect"
  );
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
