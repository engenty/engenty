import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import { createLogger, type RuntimeLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "apps/ai/run-start" });

export type ExecutionLane = "live" | "delegated_live" | "task" | "flow_task";

export type ExecutionLaneSource =
  | { kind: "live" }
  | {
      agentId: string;
      kind: "delegated";
      taskId?: string | null;
    }
  | { kind: "flow_task" };

export interface ExecutionLaneRunStart {
  agentId?: string | null;
  runId: string;
  source: ExecutionLaneSource;
  spaceId?: string | null;
  taskId?: string | null;
  threadId?: string | null;
}

export interface ExecutionLaneRunStartMarker {
  agent_id?: string;
  execution_lane: ExecutionLane;
  run_id: string;
  space_id?: string;
  task_id?: string;
  thread_id?: string;
}

export function classifyExecutionLane(
  source: ExecutionLaneSource
): ExecutionLane {
  if (source.kind === "live") {
    return "live";
  }
  if (source.kind === "flow_task") {
    return "flow_task";
  }
  // A task is a task whoever was assigned it — the coordinator has no lane of
  // its own now that there is no goal for it to plan against.
  return source.taskId ? "task" : "delegated_live";
}

function optionalId(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

/** Read either a resolved Space id or the id of an unresolved Space claim. */
export function executionSpaceId(value: unknown): string | undefined {
  if (!(value && typeof value === "object")) {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["spaceId", "space_id", "claimed_space_id"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
    }
  }
  return executionSpaceId(record.space);
}

export function createExecutionLaneRunStartMarker(
  input: ExecutionLaneRunStart
): ExecutionLaneRunStartMarker {
  const agentId =
    optionalId(input.agentId) ??
    (input.source.kind === "delegated"
      ? optionalId(input.source.agentId)
      : undefined);
  const taskId =
    optionalId(input.taskId) ??
    (input.source.kind === "delegated"
      ? optionalId(input.source.taskId)
      : undefined);
  return {
    execution_lane: classifyExecutionLane(input.source),
    run_id: input.runId,
    ...(agentId ? { agent_id: agentId } : {}),
    ...(optionalId(input.threadId)
      ? { thread_id: optionalId(input.threadId) }
      : {}),
    ...(taskId ? { task_id: taskId } : {}),
    ...(optionalId(input.spaceId)
      ? { space_id: optionalId(input.spaceId) }
      : {}),
  };
}

/**
 * Emit the one run-start marker to structured logs and, when this run has an
 * AG-UI stream, enrich its existing RUN_STARTED event with the same metadata.
 */
export function emitExecutionLaneRunStarted(
  input: ExecutionLaneRunStart,
  options: {
    emit?: (event: AGUIEvent) => void;
    logger?: Pick<RuntimeLogger, "info">;
  } = {}
): ExecutionLaneRunStartMarker {
  const marker = createExecutionLaneRunStartMarker(input);
  (options.logger ?? logger).info("run started", { ...marker });
  if (options.emit) {
    options.emit({
      ...marker,
      runId: input.runId,
      threadId: input.threadId ?? "",
      type: EventType.RUN_STARTED,
    } as AGUIEvent);
  }
  return marker;
}
