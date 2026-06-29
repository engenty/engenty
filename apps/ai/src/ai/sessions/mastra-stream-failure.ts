// Mastra can finish a stream with finishReason "error" (e.g. gateway
// context_length_exceeded) without throwing — the harness must inspect output.

const CONTEXT_LENGTH_EXCEEDED_CODE = "context_length_exceeded";

export const AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED =
  "agent_threads.contextLengthExceeded" as const;

export function isContextLengthExceededError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes(CONTEXT_LENGTH_EXCEEDED_CODE) ||
      message.includes("context window") ||
      message.includes("context length")
    );
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (record.code === CONTEXT_LENGTH_EXCEEDED_CODE) {
      return true;
    }
    if (typeof record.message === "string") {
      const message = record.message.toLowerCase();
      return (
        message.includes(CONTEXT_LENGTH_EXCEEDED_CODE) ||
        message.includes("context window") ||
        message.includes("context length")
      );
    }
  }
  return false;
}

export function formatAgentStreamFailureMessage(error: unknown): string {
  if (isContextLengthExceededError(error)) {
    return AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "agent_threads.runFailed";
}

interface MastraStreamOutput {
  finishReason?: string;
  getFullOutput?: () => Promise<{
    error?: Error;
    finishReason?: string;
  }>;
}

export async function readMastraStreamFailure(
  output: unknown
): Promise<Error | null> {
  if (!output || typeof output !== "object") {
    return null;
  }
  const stream = output as MastraStreamOutput;
  let finishReason = stream.finishReason;
  let error: unknown;
  if (typeof stream.getFullOutput === "function") {
    try {
      const full = await stream.getFullOutput();
      finishReason = full.finishReason ?? finishReason;
      error = full.error;
    } catch {
      // Prefer explicit stream failure below when getFullOutput is unavailable.
    }
  }
  if (finishReason !== "error" && !error) {
    return null;
  }
  const message = formatAgentStreamFailureMessage(error);
  return new Error(message);
}
