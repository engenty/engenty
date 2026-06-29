import { describe, expect, it } from "vitest";
import {
  errorMessage,
  formatAiServiceError,
} from "../../ui/lib/chat/chat-errors.js";

describe("formatAiServiceError", () => {
  it("maps known frontend-tool result codes to operator-friendly copy", () => {
    expect(
      formatAiServiceError(
        'ai frontend-tool result HTTP 400: {"error":"agent_threads.invalidRunOrCallId"}'
      )
    ).toBe("The browser tool call could not be matched to the active run.");
  });

  it("maps known session run error codes to operator-friendly copy", () => {
    expect(
      formatAiServiceError(
        'ai session run HTTP 503: {"error":"agent_threads.runFailed"}'
      )
    ).toBe(
      "The assistant run failed before it could finish. Try again or start a new chat."
    );
  });

  it("maps context overflow codes from direct run errors", () => {
    expect(formatAiServiceError("agent_threads.contextLengthExceeded")).toBe(
      "This conversation is too long for the selected model. Start a new chat or ask for a smaller export (for example a filtered list)."
    );
  });

  it("maps session list 404 without dumping HTML bodies", () => {
    expect(formatAiServiceError("ai sessions list HTTP 404")).toBe(
      "The AI service endpoint was not found. Start apps/ai and verify VITE_ENGENTY_AI_BASE_URL."
    );
    expect(
      formatAiServiceError(
        "ai sessions list HTTP 404: <!DOCTYPE html><html><title>404 - Not Found</title>"
      )
    ).toBe(
      "The AI service endpoint was not found. Start apps/ai and verify VITE_ENGENTY_AI_BASE_URL."
    );
  });

  it("maps network failures to setup guidance", () => {
    expect(formatAiServiceError("Failed to fetch")).toBe(
      "Could not reach the AI service. Check that apps/ai is running and VITE_ENGENTY_AI_BASE_URL is set."
    );
  });

  it("returns the original message for non-AI errors", () => {
    expect(formatAiServiceError("Network request failed")).toBe(
      "Could not reach the AI service. Check that apps/ai is running and VITE_ENGENTY_AI_BASE_URL is set."
    );
    expect(formatAiServiceError("Unexpected local failure")).toBe(
      "Unexpected local failure"
    );
  });
});

describe("errorMessage", () => {
  it("formats Error instances through formatAiServiceError", () => {
    expect(errorMessage(new Error("ai sessions list HTTP 404"))).toBe(
      "The AI service endpoint was not found. Start apps/ai and verify VITE_ENGENTY_AI_BASE_URL."
    );
  });
});
