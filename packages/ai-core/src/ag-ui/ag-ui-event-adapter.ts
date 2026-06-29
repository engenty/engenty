import type {
  AGUIEvent,
  AgentUiStateDeltaV1,
  AgentUiStateSnapshotV1,
  FrontendToolCallRequest,
  FrontendToolCallResult,
} from "@engenty/ag-ui-bridge";
import { encodeAgUiSseEvent as encodeOfficialAgUiSseEvent } from "@engenty/ag-ui-bridge";
import type { RuntimeProgressEvent } from "./events.js";

export interface AgUiEventAdapterContext {
  threadId?: string;
}

function withThreadId(
  event: AGUIEvent,
  context?: AgUiEventAdapterContext
): AGUIEvent {
  if (!context?.threadId) {
    return event;
  }
  return Object.assign(Object.create(null), event, {
    threadId: context.threadId,
  }) as AGUIEvent;
}

function stringifyToolContent(value: unknown): string {
  return typeof value === "string"
    ? value
    : (JSON.stringify(value ?? null) ?? "null");
}

export function runtimeProgressToAgUiEvent(
  event: RuntimeProgressEvent,
  context?: AgUiEventAdapterContext
): AGUIEvent {
  switch (event.type) {
    case "run.started":
      return withThreadId(
        { runId: event.run_id, type: "RUN_STARTED" },
        context
      );
    case "run.completed":
      return withThreadId(
        { runId: event.run_id, type: "RUN_FINISHED" },
        context
      );
    case "run.failed":
      return withThreadId(
        {
          message: event.error,
          runId: event.run_id,
          type: "RUN_ERROR",
        },
        context
      );
    case "context.loaded":
      return {
        name: "engenty.context.loaded",
        type: "CUSTOM",
        value: event,
      };
    case "coordinator.decision":
      return {
        name: "engenty.coordinator.decision",
        type: "CUSTOM",
        value: event,
      };
    case "tool.started":
      return {
        name: "engenty.tool.started",
        type: "CUSTOM",
        value: event,
      };
    case "tool.finished":
      return {
        name: "engenty.tool.finished",
        type: "CUSTOM",
        value: event,
      };
  }
}

export function stateSnapshotToAgUiEvent(
  state: AgentUiStateSnapshotV1
): AGUIEvent {
  return { snapshot: state, type: "STATE_SNAPSHOT" };
}

export function stateDeltaToAgUiEvent(delta: AgentUiStateDeltaV1): AGUIEvent {
  return { delta: delta.operations, type: "STATE_DELTA" };
}

export function frontendToolCallToAgUiEvents(
  request: FrontendToolCallRequest
): AGUIEvent[] {
  return [
    {
      type: "TOOL_CALL_START",
      toolCallId: request.call_id,
      toolCallName: request.tool_name,
    },
    {
      type: "TOOL_CALL_ARGS",
      toolCallId: request.call_id,
      delta: stringifyToolContent(request.input ?? {}),
    },
    {
      type: "TOOL_CALL_END",
      toolCallId: request.call_id,
    },
  ];
}

export function frontendToolResultToAgUiEvent(
  result: FrontendToolCallResult
): AGUIEvent {
  return {
    type: "TOOL_CALL_RESULT",
    toolCallId: result.call_id,
    content: stringifyToolContent(result),
  };
}

export function encodeAgUiSseEvent(event: AGUIEvent): string {
  return encodeOfficialAgUiSseEvent(event);
}
