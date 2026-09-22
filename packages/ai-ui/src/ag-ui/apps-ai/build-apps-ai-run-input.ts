import type {
  AgentUiStateSnapshotV1,
  FrontendToolDefinition,
  Message,
  RunAgentInput,
} from "@engenty/ag-ui-bridge";
import {
  agentUiStateForwardedProps,
  isAgentUiStateSnapshotV1,
  runRouteContextForwardedProps,
  toAgUiTool,
} from "@engenty/ag-ui-bridge";
import type { AiEffortChoice } from "@engenty/ai-core/browser";
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
  effort?: AiEffortChoice | null;
  frontendTools: FrontendToolDefinition[];
  messages: readonly Message[];
  modelId?: string | null;
  pathname: string;
  routeContext: EngentyAgUiRouteContext;
  threadId: string;
  state: RunAgentInput["state"];
  steerOnly?: boolean;
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
    // Only what the server actually reads. Route facts reach the agent through
    // `ui_state` (the AgentUiStateSnapshot, which the prompt header declares
    // authoritative) and `context` above — add a key here only once something
    // consumes it.
    forwardedProps: {
      engenty: {
        // Effort travels *alongside* model_id, never instead of it: a
        // self-hosted install that pins a model in expert mode must keep
        // winning over the tier the composer suggests.
        ...(params.effort ? { effort: params.effort } : {}),
        ...(modelId ? { model_id: modelId } : {}),
        // Only into the run already answering on this thread — never a run
        // of its own. The server answers 409 when there is none to steer.
        ...(params.steerOnly ? { steer_only: true } : {}),
        // The UI snapshot rides here, NOT on `state` — see
        // readAgentUiStateSnapshot in @engenty/ag-ui-bridge for why.
        ...agentUiStateForwardedProps(
          isAgentUiStateSnapshotV1(snapshot) ? snapshot : undefined
        ),
        // Where THIS turn happens — module, route, pathname and the scope
        // (space, UI language). The thread only remembers where it was
        // created; the copilot's one thread is walked through many spaces.
        ...runRouteContextForwardedProps({ ...routeContext, pathname }),
      },
    },
    messages: [...params.messages],
    runId: createRunId(),
    // AG-UI `state` is the agent's shared, DURABLE state. We have nothing that
    // belongs there, and leaving our transient UI snapshot in it would be merged
    // into working memory by any spec-following backend.
    state: {},
    threadId: params.threadId,
    tools: tools.map(toAgUiTool),
  };
}

export function buildAppsAiRunInput(params: {
  effort?: AiEffortChoice | null;
  frontendTools: FrontendToolDefinition[];
  message: Message;
  modelId?: string | null;
  pathname: string;
  routeContext: EngentyAgUiRouteContext;
  /** Steer the run in flight on this thread, or fail — start nothing. */
  steerOnly?: boolean;
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
  effort?: AiEffortChoice | null;
  frontendTools: FrontendToolDefinition[];
  modelId?: string | null;
  pathname: string;
  resume: AppsAiResumeEntry[];
  routeContext: EngentyAgUiRouteContext;
  threadId: string;
  state: RunAgentInput["state"];
}): RunAgentInput {
  const base = buildAppsAiRunInputBase({
    effort: params.effort,
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
