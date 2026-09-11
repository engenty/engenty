import type {
  AgentRunEventRow,
  AgentRunRow,
  AgentRunTrigger,
} from "../dal/threads/types.js";

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
  agent_id: string;
  created_at: string;
  error: string | null;
  finished_at: string | null;
  id: string;
  /** Catalog id written on the run. Null on older rows that never recorded one. */
  model_id: string | null;
  request_id: string | null;
  started_at: string | null;
  status: AppsAiRunSummaryStatus;
  summary: string | null;
  tenant_id: string | null;
  thread_id: string | null;
  /**
   * How the run started, straight off the row. Null on runs written before
   * `ai.agent_run.trigger` existed — readers show that as unknown rather than
   * substituting a default, which is the bug this replaced: every run in an
   * agent's Runs tab claimed a person had typed something, schedules included.
   */
  trigger: AgentRunTrigger | null;
  workflow_id: string | null;
}

export interface AppsAiRunRecord extends AppsAiRunSummary {
  context_snapshot: Record<string, unknown>;
  /**
   * Estimated USD from catalog $/MTok × this run's tokens. Null when the model
   * is missing from the catalog or neither rate is known.
   */
  cost_usd: number | null;
  /** Catalog display name; falls back to `model_id` in the UI when null. */
  model_display_name: string | null;
  /** Next run on the same thread (started_at asc). Null when this is last. */
  next_run_id: string | null;
  /** Child-run stamp: the parent `ai.agent_run.id` that spawned this one. */
  parent_run_id: string | null;
  parent_thread_id: string | null;
  parent_tool_call_id: string | null;
  /** Previous run on the same thread. Null when this is first. */
  prev_run_id: string | null;
  result_json: Record<string, unknown> | null;
  /** `ai.thread.space_id`. Null when the thread has no space. */
  space_id: string | null;
  /** 1-based index of this run on its thread. Null until neighbors are attached. */
  thread_run_count: number | null;
  thread_run_index: number | null;
  /** `ai.thread.title`. Null when the thread has no title yet. */
  thread_title: string | null;
  updated_at: string;
  usage_json: Record<string, unknown> | null;
}

export interface PlatformThreadRecord {
  agent_id: string;
  created_at: string;
  id: string;
  space_id: string | null;
  tenant_id: string;
  title: string | null;
}

export interface PlatformThreadRollup {
  cost_usd: number | null;
  duration_ms: number | null;
  tokens_in: number;
  tokens_out: number;
  turns: number;
}

export interface PlatformThreadListItem {
  last_run: AppsAiRunRecord | null;
  rollup: PlatformThreadRollup;
  thread: PlatformThreadRecord;
}

export interface PlatformModelRates {
  displayName: string | null;
  inputPerMtokMicros: number | null;
  outputPerMtokMicros: number | null;
}

/**
 * Catalog rates are micros per million tokens. Same formula as the composer
 * usage popover: tokens × rate / 1e12 → USD.
 */
export function runCostUsd(input: {
  completionTokens: number | null;
  inputPerMtokMicros: number | null;
  outputPerMtokMicros: number | null;
  promptTokens: number | null;
}): number | null {
  const inputRate = input.inputPerMtokMicros;
  const outputRate = input.outputPerMtokMicros;
  if (inputRate == null && outputRate == null) {
    return null;
  }
  const prompt = input.promptTokens ?? 0;
  const completion = input.completionTokens ?? 0;
  if (prompt <= 0 && completion <= 0) {
    return null;
  }
  return ((inputRate ?? 0) * prompt + (outputRate ?? 0) * completion) / 1e12;
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
  status: AgentRunRow["status"]
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

/** Inverse of {@link mapAiRunStatusToSummaryStatus} for admin list filters. */
export function mapSummaryStatusToAiRunStatus(
  status: string
): AgentRunRow["status"] | null {
  switch (status) {
    case "succeeded":
    case "completed":
      return "completed";
    case "waiting_for_input":
    case "interrupted":
      return "interrupted";
    case "running":
    case "failed":
    case "cancelled":
    case "requires_action":
    case "paused":
      return status;
    default:
      return null;
  }
}

function readRunSummaryFromMetadata(
  metadata: Record<string, unknown>
): string | null {
  const summary = metadata.summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parentLinkFromMetadata(metadata: Record<string, unknown>): {
  parent_run_id: string | null;
  parent_thread_id: string | null;
  parent_tool_call_id: string | null;
} {
  return {
    parent_run_id: readMetadataString(metadata, "parent_run_id"),
    parent_thread_id: readMetadataString(metadata, "parent_thread_id"),
    parent_tool_call_id: readMetadataString(metadata, "parent_tool_call_id"),
  };
}

export function attachRunNeighbors(
  records: readonly AppsAiRunRecord[]
): AppsAiRunRecord[] {
  const count = records.length;
  return records.map((record, index) => ({
    ...record,
    next_run_id: records[index + 1]?.id ?? null,
    prev_run_id: records[index - 1]?.id ?? null,
    thread_run_count: count,
    thread_run_index: index + 1,
  }));
}

export function rollupPlatformRuns(
  runs: readonly AppsAiRunRecord[]
): PlatformThreadRollup {
  let tokensIn = 0;
  let tokensOut = 0;
  let costSum = 0;
  let hasCost = false;
  let minStart: number | null = null;
  let maxEnd: number | null = null;
  for (const run of runs) {
    const input = Number(run.usage_json?.input_tokens);
    const output = Number(run.usage_json?.output_tokens);
    if (Number.isFinite(input) && input > 0) {
      tokensIn += input;
    }
    if (Number.isFinite(output) && output > 0) {
      tokensOut += output;
    }
    if (run.cost_usd != null && Number.isFinite(run.cost_usd)) {
      costSum += run.cost_usd;
      hasCost = true;
    }
    const start = run.started_at ? Date.parse(run.started_at) : Number.NaN;
    const end = run.finished_at ? Date.parse(run.finished_at) : Number.NaN;
    if (Number.isFinite(start) && (minStart == null || start < minStart)) {
      minStart = start;
    }
    if (Number.isFinite(end) && (maxEnd == null || end > maxEnd)) {
      maxEnd = end;
    }
  }
  const durationMs =
    minStart != null && maxEnd != null && maxEnd >= minStart
      ? maxEnd - minStart
      : null;
  return {
    cost_usd: hasCost ? costSum : null,
    duration_ms: durationMs,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    turns: runs.length,
  };
}

export function mapAgentRunToSummary(run: AgentRunRow): AppsAiRunSummary {
  return {
    agent_id: run.agent_id,
    created_at: run.started_at,
    error: run.error_message,
    finished_at: run.finished_at,
    id: run.id,
    model_id: run.model_id,
    request_id: null,
    thread_id: run.thread_id,
    started_at: run.started_at,
    status: mapAiRunStatusToSummaryStatus(run.status),
    summary: readRunSummaryFromMetadata(run.metadata),
    tenant_id: run.tenant_id,
    trigger: run.trigger,
    workflow_id: null,
  };
}

export function mapAgentRunToRecord(run: AgentRunRow): AppsAiRunRecord {
  const summary = mapAgentRunToSummary(run);
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
    cost_usd: null,
    model_display_name: null,
    next_run_id: null,
    ...parentLinkFromMetadata(run.metadata),
    prev_run_id: null,
    result_json:
      typeof run.metadata.result_json === "object" && run.metadata.result_json
        ? (run.metadata.result_json as Record<string, unknown>)
        : null,
    space_id: null,
    thread_run_count: null,
    thread_run_index: null,
    thread_title: null,
    updated_at: run.finished_at ?? run.started_at,
    usage_json,
  };
}

export function mapAgentRunToPlatformRecord(
  run: AgentRunRow,
  extras: {
    model?: PlatformModelRates | null;
    spaceId?: string | null;
    threadTitle?: string | null;
  } = {}
): AppsAiRunRecord {
  const record = mapAgentRunToRecord(run);
  const model = extras.model ?? null;
  return {
    ...record,
    cost_usd: model
      ? runCostUsd({
          completionTokens: run.completion_tokens,
          inputPerMtokMicros: model.inputPerMtokMicros,
          outputPerMtokMicros: model.outputPerMtokMicros,
          promptTokens: run.prompt_tokens,
        })
      : null,
    model_display_name: model?.displayName ?? null,
    space_id: extras.spaceId ?? null,
    thread_title: extras.threadTitle ?? null,
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
