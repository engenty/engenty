import fs from "node:fs";
import path from "node:path";
import { env, envIsTruthy } from "@engenty/telemetry";

/**
 * AI debug helpers: env flag and structured logging for AI generation flows.
 * When AI_DEBUG=true, routes can log full model results and include debug payloads in error responses.
 */

const AI_DEBUG_ENV_KEY = "AI_DEBUG";
const AI_DEBUG_LOG_STDOUT_ENV_KEY = "AI_DEBUG_LOG_STDOUT";
const AI_DEBUG_LOG_DIR_EXPLICIT_ENV_KEY = "AI_DEBUG_LOG_DIR";
const AI_DEBUG_LOG_FILE_ENV_KEY = "AI_DEBUG_LOG_FILE";
const AI_DEBUG_LOG_DIR_ENV_KEY = "LOG_DIR";
const AI_DEBUG_LOG_FILE_NAME = "agents.log";
const AI_DEBUG_MAX_STRING_LENGTH = 2000;
/** Max length for string values under provider_metadata (and other noisy paths) to keep logs readable. */
const AI_DEBUG_MAX_METADATA_STRING_LENGTH = 100;
const AI_DEBUG_OMITTED_KEYS = new Set(["reasoningEncryptedContent"]);
const AI_DEBUG_FULL_TEXT_KEYS = new Set([
  "text",
  "reasoning_text",
  "prompt",
  "user_message",
  "system_prompt",
]);
const AI_DEBUG_OMITTED_PATHS = [
  ["provider_metadata", "gateway", "routing", "attempts"],
];

/** Whether AI debug mode is enabled (log full results, include debug in error details). */
export function isAiDebugEnabled(): boolean {
  return envIsTruthy(AI_DEBUG_ENV_KEY);
}

/** Shape of single-turn generateText results for debug logging. */
export interface AiGenerationResultDebug {
  finishReason?: unknown;
  providerMetadata?: unknown;
  reasoning?: unknown;
  reasoningText?: unknown;
  request?: unknown;
  response?: unknown;
  steps?: unknown;
  text?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  totalUsage?: unknown;
  usage?: unknown;
}

/** Logger interface for debug output (e.g. from @engenty/telemetry createLogger). */
export interface AiDebugLogger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
}

function shouldLogAiDebugToStdout() {
  return env(AI_DEBUG_LOG_STDOUT_ENV_KEY, "true") === "true";
}

function resolveAiDebugLogPath() {
  const logDir =
    env(AI_DEBUG_LOG_DIR_EXPLICIT_ENV_KEY) ||
    env(AI_DEBUG_LOG_DIR_ENV_KEY) ||
    "./logs";
  const logFile = env(AI_DEBUG_LOG_FILE_ENV_KEY) || AI_DEBUG_LOG_FILE_NAME;
  const baseDir = resolveWorkspaceRootFromCwd();
  const absoluteDir = path.isAbsolute(logDir)
    ? logDir
    : path.resolve(baseDir, logDir);
  return path.join(absoluteDir, logFile);
}

function resolveWorkspaceRootFromCwd() {
  let current = path.resolve(process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(process.cwd());
    }
    current = parent;
  }
}

function appendAiDebugLog(params: {
  event: string;
  message: string;
  payload: Record<string, unknown>;
}) {
  const logPath = resolveAiDebugLogPath();
  if (!logPath) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(
      logPath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: params.event,
        message: params.message,
        ...params.payload,
      })}\n`,
      "utf8"
    );
  } catch {
    // Best-effort debug sink; never break the request flow if file logging fails.
  }
}

function getMaxStringLengthForPath(pathParts: string[]): number {
  const inMetadata =
    pathParts.includes("provider_metadata") ||
    pathParts.includes("providerMetadata");
  return inMetadata
    ? AI_DEBUG_MAX_METADATA_STRING_LENGTH
    : AI_DEBUG_MAX_STRING_LENGTH;
}

function truncateAiDebugString(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}… [truncated ${value.length - maxLength} chars]`;
}

function pathEndsWith(pathParts: string[], suffix: string[]) {
  if (suffix.length > pathParts.length) {
    return false;
  }
  return suffix.every(
    (part, index) =>
      pathParts[pathParts.length - suffix.length + index] === part
  );
}

function shouldOmitAiDebugPath(pathParts: string[]) {
  return AI_DEBUG_OMITTED_PATHS.some((suffix) =>
    pathEndsWith(pathParts, suffix)
  );
}

function shouldKeepFullAiDebugString(pathParts: string[], value: string) {
  const currentKey = pathParts.at(-1);
  if (currentKey && AI_DEBUG_FULL_TEXT_KEYS.has(currentKey)) {
    return true;
  }
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function sanitizeAiDebugValue(
  value: unknown,
  pathParts: string[] = []
): unknown {
  if (typeof value === "string") {
    return shouldKeepFullAiDebugString(pathParts, value)
      ? value
      : truncateAiDebugString(value, getMaxStringLengthForPath(pathParts));
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      sanitizeAiDebugValue(entry, [...pathParts, String(index)])
    );
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (AI_DEBUG_OMITTED_KEYS.has(key)) {
      continue;
    }
    const nextPath = [...pathParts, key];
    if (shouldOmitAiDebugPath(nextPath)) {
      continue;
    }
    out[key] = sanitizeAiDebugValue(entry, nextPath);
  }
  return out;
}

function sanitizeAiDebugPayload(payload: Record<string, unknown>) {
  return sanitizeAiDebugValue(payload) as Record<string, unknown>;
}

/**
 * Log the exact prompt input (system + user) to agents.log when AI_DEBUG is enabled.
 * Use before LLM calls to inspect the full prompt sent to the model (e.g. template generation).
 */
export function logAiPromptInput(
  logger: AiDebugLogger,
  params: {
    event: string;
    message: string;
    modelId?: string;
    systemPrompt?: string;
    userMessage?: string;
    [key: string]: unknown;
  }
): void {
  if (!isAiDebugEnabled()) {
    return;
  }
  // Destructure prompt fields so rest does not contain them; we log snake_case only
  // (sanitizer uses snake_case keys for full-text treatment: AI_DEBUG_FULL_TEXT_KEYS).
  const { event, message, modelId, systemPrompt, userMessage, ...rest } =
    params;
  const payload = sanitizeAiDebugPayload({
    model_id: modelId,
    system_prompt: systemPrompt,
    user_message: userMessage,
    ...rest,
  });
  if (shouldLogAiDebugToStdout()) {
    logger.info(message, payload);
  }
  appendAiDebugLog({
    event,
    message,
    payload,
  });
}

/** Log structured AI generation result at debug level when AI_DEBUG is enabled. */
export function logAiGenerationResult(
  logger: AiDebugLogger,
  params: {
    modelId: string;
    prompt: string;
    result: AiGenerationResultDebug;
  }
): void {
  if (!isAiDebugEnabled()) {
    return;
  }
  const payload = sanitizeAiDebugPayload({
    finish_reason: params.result.finishReason,
    model_id: params.modelId,
    prompt: params.prompt,
    provider_metadata: params.result.providerMetadata,
    reasoning: params.result.reasoning,
    reasoning_text:
      typeof params.result.reasoningText === "string"
        ? params.result.reasoningText
        : undefined,
    request: params.result.request,
    response: params.result.response,
    steps: params.result.steps,
    text: params.result.text,
    tool_calls: params.result.toolCalls,
    tool_results: params.result.toolResults,
    total_usage: params.result.totalUsage,
    usage: params.result.usage,
  });
  if (shouldLogAiDebugToStdout()) {
    logger.info("AI generation result", payload);
  }
  appendAiDebugLog({
    event: "ai_generation_result",
    message: "AI generation result",
    payload,
  });
}

interface AiLoopStepLike {
  content?: unknown;
  finishReason?: unknown;
  providerMetadata?: unknown;
  reasoning?: unknown;
  reasoningText?: unknown;
  text?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  usage?: unknown;
}

function summarizeStep(step: AiLoopStepLike) {
  return {
    finish_reason: step.finishReason,
    provider_metadata: step.providerMetadata,
    reasoning: step.reasoning,
    reasoning_text:
      typeof step.reasoningText === "string" ? step.reasoningText : undefined,
    text: step.text,
    tool_calls: step.toolCalls,
    tool_results: step.toolResults,
    usage: step.usage,
    ...(Array.isArray(step.content) ? { content: step.content } : {}),
  };
}

/**
 * Emit a central trace for the full specialist tool loop when AI_DEBUG=true.
 * Uses info level so the trace is visible even when the logger is not set to debug.
 */
export function logAiLoopTrace(
  logger: AiDebugLogger,
  params: {
    agentId: string;
    maxSteps: number;
    modelId: string;
    systemPrompt: string;
    toolNames: string[];
    userMessage: string;
    result: AiGenerationResultDebug;
  }
): void {
  if (!isAiDebugEnabled()) {
    return;
  }

  const startedPayload = sanitizeAiDebugPayload({
    agent_id: params.agentId,
    max_steps: params.maxSteps,
    model_id: params.modelId,
    system_prompt: params.systemPrompt,
    tool_names: params.toolNames,
    user_message: params.userMessage,
  });
  if (shouldLogAiDebugToStdout()) {
    logger.info("AI loop started", startedPayload);
  }
  appendAiDebugLog({
    event: "ai_loop_started",
    message: "AI loop started",
    payload: startedPayload,
  });

  const steps = Array.isArray(params.result.steps)
    ? (params.result.steps as AiLoopStepLike[])
    : [];

  steps.forEach((step, index) => {
    const stepPayload = sanitizeAiDebugPayload({
      step_index: index + 1,
      ...summarizeStep(step),
    });
    if (shouldLogAiDebugToStdout()) {
      logger.info("AI loop step", stepPayload);
    }
    appendAiDebugLog({
      event: "ai_loop_step",
      message: "AI loop step",
      payload: stepPayload,
    });
  });

  const completedPayload = sanitizeAiDebugPayload({
    agent_id: params.agentId,
    finish_reason: params.result.finishReason,
    model_id: params.modelId,
    step_count: steps.length,
    text: params.result.text,
    tool_calls: params.result.toolCalls,
    tool_results: params.result.toolResults,
    total_usage: params.result.totalUsage,
    usage: params.result.usage,
  });
  if (shouldLogAiDebugToStdout()) {
    logger.info("AI loop completed", completedPayload);
  }
  appendAiDebugLog({
    event: "ai_loop_completed",
    message: "AI loop completed",
    payload: completedPayload,
  });
}

/**
 * Log a chat run start event to agents.log when AI_DEBUG is enabled.
 * Call at the start of a copilot chat stream (ToolLoopAgent).
 */
export function logAiChatRunStarted(
  logger: AiDebugLogger,
  params: {
    agentId: string;
    modelId: string;
    runId: string;
    systemPrompt: string;
    toolNames: string[];
    userMessage: string;
  }
): void {
  if (!isAiDebugEnabled()) {
    return;
  }
  const payload = sanitizeAiDebugPayload({
    agent_id: params.agentId,
    model_id: params.modelId,
    run_id: params.runId,
    system_prompt: params.systemPrompt,
    tool_names: params.toolNames,
    user_message: params.userMessage,
  });
  if (shouldLogAiDebugToStdout()) {
    logger.info("AI chat run started", payload);
  }
  appendAiDebugLog({
    event: "ai_chat_run_started",
    message: "AI chat run started",
    payload,
  });
}

/**
 * Log a chat run completion event to agents.log when AI_DEBUG is enabled.
 * Call when the copilot chat stream finishes.
 */
export function logAiChatRunCompleted(
  logger: AiDebugLogger,
  params: {
    agentId: string;
    runId: string;
    error?: string;
  }
): void {
  if (!isAiDebugEnabled()) {
    return;
  }
  const payload: Record<string, unknown> = {
    agent_id: params.agentId,
    run_id: params.runId,
  };
  if (params.error) {
    payload.error = params.error;
  }
  if (shouldLogAiDebugToStdout()) {
    logger.info("AI chat run completed", payload);
  }
  appendAiDebugLog({
    event: "ai_chat_run_completed",
    message: params.error ? "AI chat run failed" : "AI chat run completed",
    payload,
  });
}

/**
 * When AI debug is enabled, returns { debug: payload }; otherwise {}.
 * Spread into error details so clients receive debug only when AI_DEBUG=true.
 */
export function withAiErrorDebug<T>(
  enabled: boolean,
  payload: T
): { debug?: T } {
  return enabled ? { debug: payload } : {};
}
