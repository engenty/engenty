import {
  type FrontendToolCallRequest,
  type FrontendToolDefinition,
  getFrontendToolInputValidationError,
  type JsonValue,
} from "@engenty/ag-ui-bridge";
import type {
  OpenAiRealtimeVoiceToolCallRequest,
  OpenAiRealtimeVoiceToolDefinition,
} from "./use-openai-realtime-voice-session.js";

const OPENAI_REALTIME_TOOL_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;
const FRONTEND_TOOL_ALIAS_PREFIX = "frontend_";

export function openAiRealtimeVoiceToolsFromFrontendTools(
  tools: readonly FrontendToolDefinition[]
): OpenAiRealtimeVoiceToolDefinition[] {
  // All enabled frontend tools auto-run — no confirmation gating.
  return tools
    .filter((tool) => tool.metadata?.engenty?.availability === "enabled")
    .map((tool) => ({
      description: tool.description,
      name: openAiRealtimeVoiceFrontendToolName(tool),
      parameters: tool.parameters,
    }));
}

/** Resolve the original frontend tool definition from a realtime tool name. */
export function resolveOpenAiRealtimeVoiceFrontendTool(
  realtimeName: string,
  tools: readonly FrontendToolDefinition[]
): FrontendToolDefinition | undefined {
  return tools.find(
    (tool) => openAiRealtimeVoiceFrontendToolName(tool) === realtimeName
  );
}

export async function executeOpenAiRealtimeVoiceFrontendTool(params: {
  executeFrontendTool: (
    request: FrontendToolCallRequest
  ) => Promise<JsonValue> | JsonValue;
  request: OpenAiRealtimeVoiceToolCallRequest;
  runId: string;
  tools?: readonly FrontendToolDefinition[];
}): Promise<JsonValue> {
  const toolName = resolveOpenAiRealtimeVoiceFrontendToolName(
    params.request.name,
    params.tools ?? []
  );
  const input = normalizeRealtimeToolInput(params.request.arguments);
  const validationError = getFrontendToolInputValidationError(toolName, input);
  if (validationError) {
    throw new Error(validationError);
  }
  return params.executeFrontendTool({
    call_id: params.request.callId,
    input,
    run_id: params.runId,
    tool_name: toolName,
  });
}

export function openAiRealtimeVoiceFrontendToolName(
  tool: Pick<FrontendToolDefinition, "name">
): string {
  const name = tool.name.trim();
  if (OPENAI_REALTIME_TOOL_NAME_PATTERN.test(name)) {
    return name;
  }
  const slug = name
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return `${FRONTEND_TOOL_ALIAS_PREFIX}${slug || "tool"}_${toolNameHash(name)}`;
}

function resolveOpenAiRealtimeVoiceFrontendToolName(
  realtimeName: string,
  tools: readonly FrontendToolDefinition[]
): string {
  return (
    tools.find(
      (tool) => openAiRealtimeVoiceFrontendToolName(tool) === realtimeName
    )?.name ?? realtimeName
  );
}

function toolNameHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 2_176_782_336;
  }
  return Math.trunc(hash).toString(36);
}

export function normalizeRealtimeToolInput(value: unknown): JsonValue {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as JsonValue;
    } catch {
      return {};
    }
  }
  return value as JsonValue;
}
