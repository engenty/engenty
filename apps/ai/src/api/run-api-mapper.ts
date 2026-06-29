import type {
  AgentRunEventRow,
  AgentSessionRunRow,
} from "../dal/agent-sessions/types.js";

export type AppsAiRunSummaryStatus =
  | "queued"
  | "running"
  | "waiting_for_input"
  | "waiting_for_approval"
  | "requires_action"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface AppsAiRunSummary {
  action_id: string | null;
  agent_id: string;
  created_at: string;
  error: string | null;
  finished_at: string | null;
  id: string;
  request_id: string | null;
  started_at: string | null;
  status: AppsAiRunSummaryStatus;
  summary: string | null;
  tenant_id: string | null;
  thread_id: string | null;
  trigger: "message" | "command" | "button" | "cron" | "hook" | "direct";
}

export interface AppsAiRunRecord extends AppsAiRunSummary {
  context_snapshot: Record<string, unknown>;
  result_json: Record<string, unknown> | null;
  updated_at: string;
  usage_json: Record<string, unknown> | null;
}

export interface AppsAiRunEventRecord {
  created_at: string;
  event_type: string;
  id: string;
  level: string | null;
  message: string | null;
  payload: Record<string, unknown>;
  run_id: string;
  seq: number;
}

export function mapAiRunStatusToSummaryStatus(
  status: AgentSessionRunRow["status"]
): AppsAiRunSummaryStatus {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "requires_action":
      return "requires_action";
    case "paused":
      return "paused";
    case "interrupted":
      return "waiting_for_input";
    default:
      return "failed";
  }
}

function readRunSummaryFromMetadata(
  metadata: Record<string, unknown>
): string | null {
  const summary = metadata.summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}

export function mapAgentSessionRunToSummary(
  run: AgentSessionRunRow
): AppsAiRunSummary {
  return {
    action_id: null,
    agent_id: run.agent_id,
    created_at: run.started_at,
    error: run.error_message,
    finished_at: run.finished_at,
    id: run.id,
    request_id: null,
    thread_id: run.thread_id,
    started_at: run.started_at,
    status: mapAiRunStatusToSummaryStatus(run.status),
    summary: readRunSummaryFromMetadata(run.metadata),
    tenant_id: run.tenant_id,
    trigger: "message",
  };
}

export function mapAgentSessionRunToRecord(
  run: AgentSessionRunRow
): AppsAiRunRecord {
  const summary = mapAgentSessionRunToSummary(run);
  const usage_json =
    run.prompt_tokens != null || run.completion_tokens != null
      ? {
          input_tokens: run.prompt_tokens,
          output_tokens: run.completion_tokens,
        }
      : null;
  return {
    ...summary,
    context_snapshot:
      typeof run.metadata.context_snapshot === "object" &&
      run.metadata.context_snapshot
        ? (run.metadata.context_snapshot as Record<string, unknown>)
        : {},
    result_json:
      typeof run.metadata.result_json === "object" && run.metadata.result_json
        ? (run.metadata.result_json as Record<string, unknown>)
        : null,
    updated_at: run.finished_at ?? run.started_at,
    usage_json,
  };
}

export function mapAgentRunEventRow(
  event: AgentRunEventRow
): AppsAiRunEventRecord {
  const message =
    typeof event.payload.message === "string" ? event.payload.message : null;
  const level =
    event.event_type === "RUN_ERROR"
      ? "error"
      : event.event_type.includes("TOOL")
        ? "info"
        : null;
  return {
    created_at: event.created_at,
    event_type: event.event_type,
    id: event.id,
    level,
    message,
    payload: event.payload,
    run_id: event.run_id,
    seq: event.seq,
  };
}
