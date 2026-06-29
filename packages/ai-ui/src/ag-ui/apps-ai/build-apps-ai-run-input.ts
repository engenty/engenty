import type {
  AgentUiStateSnapshotV1,
  FrontendToolDefinition,
  Message,
  RunAgentInput,
} from "@engenty/ag-ui-bridge";
import { isAgentUiStateSnapshotV1, toAgUiTool } from "@engenty/ag-ui-bridge";
import type { EngentyAgUiRouteContext } from "../engenty-ag-ui-route-context.js";

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}`;
}

function createSnapshotId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `snapshot-${Date.now()}`;
}

/** Prefer the live app-shell snapshot; otherwise build a minimal bounded fallback. */
export function resolveAppsAiRunState(input: {
  routeContext: EngentyAgUiRouteContext;
  threadId: string;
  state?: RunAgentInput["state"];
}): AgentUiStateSnapshotV1 | RunAgentInput["state"] {
  if (isAgentUiStateSnapshotV1(input.state)) {
    return input.state;
  }
  const { routeContext } = input;
  return {
    observed_at: new Date().toISOString(),
    page: {
      thread_id: input.threadId,
    },
    route: {
      module_id: routeContext.moduleId,
      pathname: routeContext.pathname,
      route_key: routeContext.routeKey,
    },
    sequence: Date.now(),
    shell: {
      copilot_open: true,
    },
    snapshot_id: createSnapshotId(),
    version: 1 as const,
  };
}

function buildAppsAiRunInputBase(params: {
  frontendTools: FrontendToolDefinition[];
  messages: readonly Message[];
  modelId?: string | null;
  pathname: string;
  routeContext: EngentyAgUiRouteContext;
  threadId: string;
  state: RunAgentInput["state"];
}): RunAgentInput {
  const { routeContext } = params;
  const pathname = params.pathname;
  const moduleId = routeContext.moduleId;
  const routeKey = routeContext.routeKey;
  const tools = params.frontendTools;
  const resolvedState = resolveAppsAiRunState({
    routeContext,
    threadId: params.threadId,
    state: params.state,
  });
  const snapshot = isAgentUiStateSnapshotV1(resolvedState)
    ? {
        ...resolvedState,
        permissions: {
          frontend_tools: Object.fromEntries(
            tools.map((tool) => {
              const metadata = tool.metadata.engenty;
              return [
                tool.name,
                {
                  available: metadata.availability === "enabled",
                  requires_confirmation:
                    metadata.safety === "requires_confirmation",
                },
              ];
            })
          ),
          ...resolvedState.permissions,
        },
      }
    : resolvedState;
  const modelId = params.modelId?.trim();
  return {
    context: [
      { description: "Engenty thread id", value: params.threadId },
      { description: "Engenty module id", value: moduleId },
      { description: "Engenty route key", value: routeKey },
      { description: "Engenty route", value: pathname },
    ],
    forwardedProps: {
      engenty: {
        ...(modelId ? { model_id: modelId } : {}),
        ...(routeContext.scope && Object.keys(routeContext.scope).length > 0
          ? { scope: routeContext.scope }
          : {}),
      },
    },
    messages: [...params.messages],
    runId: createRunId(),
    state: snapshot,
    threadId: params.threadId,
    tools: tools.map(toAgUiTool),
  };
}

export function buildAppsAiRunInput(params: {
  frontendTools: FrontendToolDefinition[];
  message: Message;
  modelId?: string | null;
  pathname: string;
  routeContext: EngentyAgUiRouteContext;
  threadId: string;
  state: RunAgentInput["state"];
}): RunAgentInput {
  return buildAppsAiRunInputBase({
    ...params,
    messages: [params.message],
  });
}

export type AppsAiResumeEntry = NonNullable<RunAgentInput["resume"]>[number];

/** Official AG-UI interrupt resume — no new user messages on the wire. */
export function buildAppsAiResumeRunInput(params: {
  frontendTools: FrontendToolDefinition[];
  modelId?: string | null;
  pathname: string;
  resume: AppsAiResumeEntry[];
  routeContext: EngentyAgUiRouteContext;
  threadId: string;
  state: RunAgentInput["state"];
}): RunAgentInput {
  const base = buildAppsAiRunInputBase({
    frontendTools: params.frontendTools,
    messages: [],
    modelId: params.modelId,
    pathname: params.pathname,
    routeContext: params.routeContext,
    threadId: params.threadId,
    state: params.state,
  });
  return {
    ...base,
    resume: params.resume,
  };
}
