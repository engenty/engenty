import type {
  AGUIEvent,
  AgentUiStateDeltaV1,
  AgentUiStateSnapshotV1,
  FrontendToolCallRequest,
  FrontendToolCallResult,
} from "@engenty/ag-ui-bridge";
import {
  EventType,
  encodeAgUiSseEvent as encodeOfficialAgUiSseEvent,
} from "@engenty/ag-ui-bridge";
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
        { runId: event.run_id, type: EventType.RUN_STARTED } as AGUIEvent,
        context
      );
    case "run.completed":
      return withThreadId(
        { runId: event.run_id, type: EventType.RUN_FINISHED } as AGUIEvent,
        context
      );
    case "run.failed":
      return withThreadId(
        {
          message: event.error,
          runId: event.run_id,
          type: EventType.RUN_ERROR,
        },
        context
      );
    case "context.loaded":
      return {
        name: "engenty.context.loaded",
        type: EventType.CUSTOM,
        value: event,
      };
    case "coordinator.decision":
      return {
        name: "engenty.coordinator.decision",
        type: EventType.CUSTOM,
        value: event,
      };
    case "tool.started":
      return {
        name: "engenty.tool.started",
        type: EventType.CUSTOM,
        value: event,
      };
    case "tool.finished":
      return {
        name: "engenty.tool.finished",
        type: EventType.CUSTOM,
        value: event,
      };
  }
}

export function stateSnapshotToAgUiEvent(
  state: AgentUiStateSnapshotV1
): AGUIEvent {
  return { snapshot: state, type: EventType.STATE_SNAPSHOT };
}

export function stateDeltaToAgUiEvent(delta: AgentUiStateDeltaV1): AGUIEvent {
  return { delta: delta.operations, type: EventType.STATE_DELTA };
}

export function frontendToolCallToAgUiEvents(
  request: FrontendToolCallRequest
): AGUIEvent[] {
  return [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: request.call_id,
      toolCallName: request.tool_name,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: request.call_id,
      delta: stringifyToolContent(request.input ?? {}),
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: request.call_id,
    },
  ];
}

export function frontendToolResultToAgUiEvent(
  result: FrontendToolCallResult
): AGUIEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: result.call_id,
    content: stringifyToolContent(result),
  } as AGUIEvent;
}

export function encodeAgUiSseEvent(event: AGUIEvent): string {
  return encodeOfficialAgUiSseEvent(event);
}
