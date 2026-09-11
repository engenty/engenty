import type { AGUIEvent, TrajectoryCellKind } from "@engenty/ag-ui-bridge";
import type { InspectorToolCall } from "./ag-ui-inspector-model.js";

export type InspectorToolDisplayStatus = "pending" | "success" | "error";

export function resolveToolDisplayStatus(
  tool: InspectorToolCall
): InspectorToolDisplayStatus {
  if (tool.status === "result" && tool.result) {
    const lower = tool.result.toLowerCase();
    if (
      lower.includes('"error"') ||
      lower.includes("failed") ||
      lower.includes("tripwire")
    ) {
      return "error";
    }
    return "success";
  }
  if (tool.status === "ended" && !tool.result) {
    return "pending";
  }
  return "pending";
}

export function toolStatusLabel(status: InspectorToolDisplayStatus): string {
  switch (status) {
    case "success":
      return "success";
    case "error":
      return "error";
    default:
      return "pending";
  }
}

export function toolStatusClassName(
  status: InspectorToolDisplayStatus
): string {
  switch (status) {
    case "success":
      return "text-emerald-600 dark:text-emerald-400";
    case "error":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-amber-600 dark:text-amber-400";
  }
}

export function timelineEventClassName(eventType: string): string {
  if (eventType.startsWith("TOOL_CALL")) {
    return "text-amber-700 dark:text-amber-300";
  }
  if (eventType.startsWith("TEXT_MESSAGE")) {
    return "text-sky-700 dark:text-sky-300";
  }
  if (eventType.startsWith("RUN_")) {
    return "text-emerald-700 dark:text-emerald-300";
  }
  if (eventType === "CUSTOM") {
    return "text-violet-700 dark:text-violet-300";
  }
  if (eventType.startsWith("STATE_")) {
    return "text-cyan-700 dark:text-cyan-300";
  }
  return "text-muted-foreground";
}

export function timelineMessageClassName(role: string): string {
  if (role === "user") {
    return "text-primary";
  }
  if (role === "assistant") {
    return "text-foreground";
  }
  return "text-muted-foreground";
}

export type InspectorTrajectoryKind = TrajectoryCellKind;

export const TRAJECTORY_KIND_LABEL: Record<InspectorTrajectoryKind, string> = {
  assistant: "ASSISTANT",
  context: "CONTEXT",
  history: "HISTORY",
  system: "SYSTEM",
  tool: "TOOL",
  user: "USER",
};

export function trajectoryKindClassName(kind: InspectorTrajectoryKind): string {
  switch (kind) {
    case "user":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "context":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "history":
      return "bg-teal-500/15 text-teal-800 dark:text-teal-300";
    case "assistant":
      return "bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "tool":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function trajectoryKeyClassName(
  key: string,
  kind: InspectorTrajectoryKind
): string {
  switch (key) {
    case "user":
    case "human":
      return "bg-sky-500/20 text-sky-800 dark:text-sky-300";
    case "agent":
      return "bg-amber-500/20 text-amber-900 dark:text-amber-200";
    case "assistant":
      return "bg-violet-500/20 text-violet-800 dark:text-violet-300";
    case "signal":
      return "bg-fuchsia-500/20 text-fuchsia-800 dark:text-fuchsia-300";
    default:
      return kind === "tool"
        ? "bg-amber-500/25 text-amber-900 dark:text-amber-200"
        : "bg-muted text-muted-foreground";
  }
}

export function truncateInline(value: string, max = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1)}…`;
}

/** Pretty-print minified JSON for display; leaves non-JSON text unchanged. */
export function formatDisplayText(value: string): string {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return value;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

export function formatToolParameters(args: string): string {
  const trimmed = args.trim();
  if (!trimmed) {
    return "{}";
  }
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

export function agUiEventType(event: AGUIEvent): string {
  return typeof (event as { type?: unknown }).type === "string"
    ? (event as { type: string }).type
    : "UNKNOWN";
}
