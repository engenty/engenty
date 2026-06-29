import { describe, expect, it } from "vitest";
import {
  formatCopilotRunError,
  resolveAgUiRunErrorEventMessage,
} from "./run-error-message.js";

describe("formatCopilotRunError", () => {
  it("maps context length codes to user-facing copy", () => {
    expect(formatCopilotRunError("agent_threads.contextLengthExceeded")).toBe(
      "This conversation is too long for the selected model. Start a new chat or ask for a smaller export (for example a filtered list)."
    );
  });

  it("detects provider context_length_exceeded in raw messages", () => {
    expect(
      formatCopilotRunError(
        "Your input exceeds the context window. context_length_exceeded"
      )
    ).toContain("too long for the selected model");
  });

  it("parses session run HTTP errors", () => {
    expect(
      formatCopilotRunError(
        'ai session run HTTP 500: {"error":"agent_threads.contextLengthExceeded"}'
      )
    ).toContain("too long for the selected model");
  });
});

describe("resolveAgUiRunErrorEventMessage", () => {
  it("formats RUN_ERROR event payloads", () => {
    expect(
      resolveAgUiRunErrorEventMessage({
        message: "agent_threads.contextLengthExceeded",
      })
    ).toContain("too long for the selected model");
  });
});
