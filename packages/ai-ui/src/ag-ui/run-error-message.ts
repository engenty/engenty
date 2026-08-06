// Maps apps/ai run failure codes and provider errors to copilot-facing copy.

const RUN_ERROR_CODE_LABELS: Record<string, string> = {
  "agent_threads.contextLengthExceeded":
    "This conversation is too long for the selected model. Start a new chat or ask for a smaller export (for example a filtered list).",
  "agent_threads.runFailed":
    "The assistant run failed. Try again or start a new chat.",
  "agent_threads.usageLimitExceeded":
    "AI usage limit reached for this tenant or user.",
  "agent_threads.invalidResume": "Could not resume the interrupted step.",
  "agent_threads.interruptNotFound":
    "The pending approval or decision is no longer available.",
  "agent_threads.interruptMismatch":
    "The resume action did not match the open interrupt.",
  "agent_threads.resumeInProgress":
    "This approval is already being processed. Please wait a moment.",
  "agent_threads.interruptExpired": "The pending approval or decision expired.",
};

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

function mapProviderOrCodeMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  const labeled = RUN_ERROR_CODE_LABELS[trimmed];
  if (labeled) {
    return labeled;
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("context_length_exceeded") ||
    lower.includes("maximum context length") ||
    lower.includes("context window") ||
    lower.includes("prompt is too long") ||
    lower.includes("token limit")
  ) {
    return "This chat is too long for the selected model. Start a new chat or ask for a smaller result.";
  }
  return null;
}

/** User-facing copy for SSE `RUN_ERROR`, thrown run errors, and HTTP run failures. */
export function formatCopilotRunError(message: string): string {
  const mapped = mapProviderOrCodeMessage(message);
  if (mapped) {
    return mapped;
  }

  const sessionRunMatch = message.match(/^ai session run HTTP (\d+):\s*(.*)$/s);
  if (sessionRunMatch) {
    const status = sessionRunMatch[1];
    const body = sessionRunMatch[2]?.trim() ?? "";
    const parsed = tryParseJsonObject(body);
    const code =
      parsed && typeof parsed.error === "string" ? parsed.error.trim() : "";
    if (code) {
      const fromCode = mapProviderOrCodeMessage(code);
      if (fromCode) {
        return fromCode;
      }
      return `AI service error (${status}): ${code}`;
    }
    return `AI service error (${status})`;
  }

  const frontendToolMatch = message.match(
    /^ai frontend-tool result HTTP (\d+):\s*(.*)$/s
  );
  if (frontendToolMatch) {
    const status = frontendToolMatch[1];
    const body = frontendToolMatch[2]?.trim() ?? "";
    const parsed = tryParseJsonObject(body);
    const code =
      parsed && typeof parsed.error === "string" ? parsed.error.trim() : "";
    if (code) {
      const fromCode = mapProviderOrCodeMessage(code);
      if (fromCode) {
        return fromCode;
      }
      return `AI service error (${status}): ${code}`;
    }
    return `AI service error (${status})`;
  }

  return message;
}

export function resolveAgUiRunErrorEventMessage(
  event: Record<string, unknown>
): string {
  const message = event.message;
  if (typeof message === "string" && message.trim()) {
    return formatCopilotRunError(message.trim());
  }
  const error = event.error;
  if (typeof error === "string" && error.trim()) {
    return formatCopilotRunError(error.trim());
  }
  return formatCopilotRunError("agent_threads.runFailed");
}
