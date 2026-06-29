export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return formatAiServiceError(raw);
}

const AI_SERVICE_ERROR_CODES: Record<string, string> = {
  "agent_threads.contextLengthExceeded":
    "This conversation is too long for the selected model. Start a new chat or ask for a smaller export (for example a filtered list).",
  "agent_threads.invalidRunOrCallId":
    "The browser tool call could not be matched to the active run.",
  "agent_threads.invalidBody": "The browser tool result payload was invalid.",
  "agent_threads.resultMismatch":
    "The browser tool result did not match the active run.",
  "agent_threads.runFailed":
    "The assistant run failed before it could finish. Try again or start a new chat.",
  "agent_threads.staleFrontendToolCall":
    "The browser tool call expired before a result arrived.",
};

const NETWORK_ERROR_PATTERNS = [
  /^failed to fetch$/i,
  /^networkerror/i,
  /^load failed$/i,
  /^network request failed$/i,
];

export function formatAiServiceError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Something went wrong while contacting the AI service.";
  }

  if (trimmed === "No access token available") {
    return "Sign in again to use Copilot.";
  }

  if (NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "Could not reach the AI service. Check that apps/ai is running and VITE_ENGENTY_AI_BASE_URL is set.";
  }

  const httpMatch = trimmed.match(/^ai .+ HTTP (\d+)(?::\s*(.*))?$/s);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    const body = httpMatch[2]?.trim() ?? "";
    const parsed = tryParseJsonObject(body);
    const code =
      parsed && typeof parsed.error === "string" ? parsed.error.trim() : "";
    if (code && AI_SERVICE_ERROR_CODES[code]) {
      return AI_SERVICE_ERROR_CODES[code];
    }
    if (code) {
      return `${formatAiHttpStatusHint(status)} (${code})`;
    }
    return formatAiHttpStatusHint(status);
  }

  if (AI_SERVICE_ERROR_CODES[trimmed]) {
    return AI_SERVICE_ERROR_CODES[trimmed];
  }

  if (isHtmlResponseBody(trimmed)) {
    return "The AI service returned an unexpected HTML error page.";
  }

  return trimmed;
}

function formatAiHttpStatusHint(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "You are not authorized to use the AI service. Sign in again or check your workspace access.";
    case 404:
      return "The AI service endpoint was not found. Start apps/ai and verify VITE_ENGENTY_AI_BASE_URL.";
    case 408:
    case 429:
      return "The AI service timed out or is rate limiting requests. Try again shortly.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "The AI service is temporarily unavailable. Try again in a moment.";
    default:
      return `The AI service returned HTTP ${status}.`;
  }
}

function isHtmlResponseBody(body: string): boolean {
  const normalized = body.trimStart().toLowerCase();
  return (
    normalized.startsWith("<!doctype") ||
    normalized.startsWith("<html") ||
    (normalized.startsWith("<") && normalized.includes("</"))
  );
}

function tryParseJsonObject(value: string): Record<string, unknown> | null {
  if (!value.startsWith("{")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
