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

  it("maps provider moderation errors to the content-filter copy", () => {
    expect(
      formatCopilotRunError(
        "<400> InternalError.Algo.DataInspectionFailed: Output data may contain inappropriate content."
      )
    ).toContain("content filter");
    expect(formatCopilotRunError("finish_reason: content_filter")).toContain(
      "content filter"
    );
  });

  it("explains a run lost to a process restart", () => {
    expect(
      formatCopilotRunError("Process restarted while run was in progress")
    ).toContain("restarted");
  });

  it("never shows a raw JSON error object as chat copy", () => {
    const formatted = formatCopilotRunError(
      '{"name":"AI_TypeValidationError","cause":{"name":"ZodError"}}'
    );
    expect(formatted).not.toContain("{");
    expect(formatted).toContain("run failed");
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

describe("named run guard failures", () => {
  it("maps the timeout, step-limit, empty-reply and guardrail codes to copy", () => {
    expect(formatCopilotRunError("agent_threads.runTimedOut")).toContain(
      "took too long"
    );
    expect(formatCopilotRunError("agent_threads.stepLimitReached")).toContain(
      "step limit"
    );
    expect(formatCopilotRunError("agent_threads.emptyReply")).toContain(
      "without a reply"
    );
    expect(formatCopilotRunError("agent_threads.guardrailTripped")).toContain(
      "guardrail"
    );
  });
});
