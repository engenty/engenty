import {
  appsAiRequestHeaders,
  normalizeAppsAiServiceBaseUrl,
  resolveEngentyAiServiceBaseUrl,
} from "./apps-ai-api.js";
import type {
  OpenAiRealtimeVoiceToolCallRequest,
  OpenAiRealtimeVoiceToolDefinition,
} from "./use-openai-realtime-voice-session.js";

const APPS_AI_REALTIME_TOOL_EXECUTE_PATH = "/ai/v1/realtime/tools/execute";
const APPS_AI_REALTIME_TOOL_APPROVE_PATH = "/ai/v1/realtime/tools/approve";
const APPS_AI_REALTIME_FIELDS_APPLY_PATH = "/ai/v1/realtime/fields/apply";
const TOOL_APPROVAL_ARTIFACT_PREFIX = "tool-approval|";

export type RealtimeVoiceToolApprovalDecision =
  | "approve_always"
  | "approve_once"
  | "deny";

export interface RealtimeVoiceToolApprovalChoice {
  id: string;
  label: string;
}

export interface RealtimeVoiceToolApproval {
  artifactId: string;
  body?: string;
  choices: RealtimeVoiceToolApprovalChoice[];
  interruptId?: string;
  operationId: string;
  title: string;
}

/**
 * Detect a backend tool-approval gate in an `engenty_tool_execute` result. The
 * backend returns a decision artifact (instead of running) when an op needs the
 * user's approval; voice surfaces it via the same DecisionArtifactCard the text
 * copilot uses, rather than handing the raw artifact to the model.
 */
export function parseRealtimeVoiceToolApproval(
  result: unknown
): RealtimeVoiceToolApproval | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as Record<string, unknown>;
  if (record.artifact_type !== "decision") {
    return null;
  }
  const artifactId =
    typeof record.artifact_id === "string" ? record.artifact_id : "";
  if (!artifactId.startsWith(TOOL_APPROVAL_ARTIFACT_PREFIX)) {
    return null;
  }
  const encoded = artifactId.slice(TOOL_APPROVAL_ARTIFACT_PREFIX.length);
  let operationId = encoded;
  try {
    operationId = decodeURIComponent(encoded) || encoded;
  } catch {
    operationId = encoded;
  }
  return {
    artifactId,
    body: typeof record.body === "string" ? record.body : undefined,
    choices: parseApprovalChoices(record.choices),
    interruptId:
      typeof record.interrupt_id === "string" ? record.interrupt_id : undefined,
    operationId,
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title
        : operationId,
  };
}

function parseApprovalChoices(
  value: unknown
): RealtimeVoiceToolApprovalChoice[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((choice) => {
    if (!choice || typeof choice !== "object") {
      return [];
    }
    const record = choice as Record<string, unknown>;
    return typeof record.id === "string" && typeof record.label === "string"
      ? [{ id: record.id, label: record.label }]
      : [];
  });
}

const EMPTY_OBJECT_SCHEMA = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const;

export const OPENAI_REALTIME_VOICE_ENGENTY_BACKEND_TOOLS: readonly OpenAiRealtimeVoiceToolDefinition[] =
  [
    {
      description:
        "Read safe Engenty workspace context for the current authenticated user and tenant.",
      name: "engenty_tools_context",
      parameters: EMPTY_OBJECT_SCHEMA,
    },
    {
      description:
        "List active Engenty modules and sample backend tool ids available to the current user.",
      name: "engenty_tools_modules",
      parameters: EMPTY_OBJECT_SCHEMA,
    },
    {
      description:
        "Search Engenty backend tool contracts. Use this before selecting a module tool to execute.",
      name: "engenty_tools_search",
      parameters: {
        additionalProperties: false,
        properties: {
          kind: { enum: ["all", "tool"], type: "string" },
          limit: { maximum: 20, minimum: 1, type: "integer" },
          moduleId: { type: "string" },
          query: { type: "string" },
          readOnlyOnly: { type: "boolean" },
        },
        type: "object",
      },
    },
    {
      description:
        "Describe one Engenty backend tool by id, including input schema, risk, and approval metadata.",
      name: "engenty_tool_describe",
      parameters: {
        additionalProperties: false,
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
        type: "object",
      },
    },
    {
      description:
        "Execute a selected Engenty backend tool by id. Call engenty_tools_search or engenty_tool_describe first when the input shape is unclear.",
      name: "engenty_tool_execute",
      parameters: {
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          input: {
            additionalProperties: true,
            type: "object",
          },
        },
        required: ["id"],
        type: "object",
      },
    },
  ];

export interface ExecuteOpenAiRealtimeVoiceBackendToolOptions {
  auth?: "apps-ai" | "none";
  baseUrl?: string;
  headers?: Record<string, string>;
  request: OpenAiRealtimeVoiceToolCallRequest;
  signal?: AbortSignal;
  threadId?: string | null;
  toolExecutePath?: string;
  toolExecuteUrl?: string;
}

export function isOpenAiRealtimeVoiceBackendToolName(name: string): boolean {
  return OPENAI_REALTIME_VOICE_ENGENTY_BACKEND_TOOLS.some(
    (tool) => tool.name === name
  );
}

export async function executeOpenAiRealtimeVoiceBackendTool({
  auth = "apps-ai",
  baseUrl,
  headers,
  request,
  signal,
  threadId,
  toolExecutePath = APPS_AI_REALTIME_TOOL_EXECUTE_PATH,
  toolExecuteUrl,
}: ExecuteOpenAiRealtimeVoiceBackendToolOptions): Promise<unknown> {
  const useSameOriginPath =
    !toolExecuteUrl &&
    auth === "none" &&
    !baseUrl &&
    toolExecutePath.startsWith("/");
  const resolvedBaseUrl =
    useSameOriginPath || toolExecuteUrl
      ? undefined
      : (baseUrl ?? resolveEngentyAiServiceBaseUrl());
  if (!(toolExecuteUrl || useSameOriginPath || resolvedBaseUrl)) {
    throw new Error("Engenty AI service base URL is not configured");
  }
  const url =
    toolExecuteUrl ??
    (useSameOriginPath
      ? toolExecutePath
      : `${normalizeAppsAiServiceBaseUrl(resolvedBaseUrl ?? "")}${toolExecutePath}`);
  const requestHeaders =
    headers ??
    (auth === "apps-ai"
      ? await appsAiRequestHeaders()
      : { "content-type": "application/json" });

  const response = await fetch(url, {
    body: JSON.stringify({
      arguments: request.arguments,
      call_id: request.callId,
      name: request.name,
      ...(threadId ? { thread_id: threadId } : {}),
    }),
    headers: {
      "content-type": "application/json",
      ...requestHeaders,
    },
    method: "POST",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
    result?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(
      payload?.message ??
        payload?.error ??
        `Realtime tool execution failed (${response.status})`
    );
  }
  return payload?.result ?? {};
}

export interface PostRealtimeVoiceToolApproveOptions {
  auth?: "apps-ai" | "none";
  baseUrl?: string;
  decision: RealtimeVoiceToolApprovalDecision;
  headers?: Record<string, string>;
  operationId: string;
  signal?: AbortSignal;
  threadId: string;
  toolApproveUrl?: string;
}

/** Persist a voice user's approval decision for a gated backend op. */
export async function postRealtimeVoiceToolApprove({
  auth = "apps-ai",
  baseUrl,
  decision,
  headers,
  operationId,
  signal,
  threadId,
  toolApproveUrl,
}: PostRealtimeVoiceToolApproveOptions): Promise<{ granted: boolean }> {
  const resolvedBaseUrl = toolApproveUrl
    ? undefined
    : (baseUrl ?? resolveEngentyAiServiceBaseUrl());
  if (!(toolApproveUrl || resolvedBaseUrl)) {
    throw new Error("Engenty AI service base URL is not configured");
  }
  const url =
    toolApproveUrl ??
    `${normalizeAppsAiServiceBaseUrl(resolvedBaseUrl ?? "")}${APPS_AI_REALTIME_TOOL_APPROVE_PATH}`;
  const requestHeaders =
    headers ??
    (auth === "apps-ai"
      ? await appsAiRequestHeaders()
      : { "content-type": "application/json" });
  const response = await fetch(url, {
    body: JSON.stringify({
      decision,
      operation_id: operationId,
      thread_id: threadId,
    }),
    headers: { "content-type": "application/json", ...requestHeaders },
    method: "POST",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    granted?: boolean;
    message?: string;
  } | null;
  if (!response.ok) {
    throw new Error(
      payload?.message ??
        payload?.error ??
        `Realtime tool approval failed (${response.status})`
    );
  }
  return { granted: payload?.granted === true };
}

export interface PostRealtimeVoiceFieldsApplyOptions {
  approved: Array<{ field: string; value: string | null }>;
  auth?: "apps-ai" | "none";
  baseUrl?: string;
  contextId: string;
  contextType: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  toolApplyUrl?: string;
}

/** Apply user-approved field suggestions to a subject from the voice client. */
export async function postRealtimeVoiceFieldsApply({
  approved,
  auth = "apps-ai",
  baseUrl,
  contextId,
  contextType,
  headers,
  signal,
  toolApplyUrl,
}: PostRealtimeVoiceFieldsApplyOptions): Promise<{ applied: number }> {
  const resolvedBaseUrl = toolApplyUrl
    ? undefined
    : (baseUrl ?? resolveEngentyAiServiceBaseUrl());
  if (!(toolApplyUrl || resolvedBaseUrl)) {
    throw new Error("Engenty AI service base URL is not configured");
  }
  const url =
    toolApplyUrl ??
    `${normalizeAppsAiServiceBaseUrl(resolvedBaseUrl ?? "")}${APPS_AI_REALTIME_FIELDS_APPLY_PATH}`;
  const requestHeaders =
    headers ??
    (auth === "apps-ai"
      ? await appsAiRequestHeaders()
      : { "content-type": "application/json" });
  const response = await fetch(url, {
    body: JSON.stringify({
      approved,
      context_id: contextId,
      context_type: contextType,
    }),
    headers: { "content-type": "application/json", ...requestHeaders },
    method: "POST",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as {
    applied?: number;
    error?: string;
    message?: string;
  } | null;
  if (!response.ok) {
    throw new Error(
      payload?.message ??
        payload?.error ??
        `Realtime field apply failed (${response.status})`
    );
  }
  return { applied: payload?.applied ?? 0 };
}
