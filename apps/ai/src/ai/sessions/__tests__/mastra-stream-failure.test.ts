import { describe, expect, it } from "vitest";
import {
  AGENT_THREADS_CONTENT_FILTERED,
  AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED,
  AGENT_THREADS_OUTPUT_TRUNCATED,
  formatAgentStreamFailureMessage,
  isContextLengthExceededError,
  readMastraStreamFailure,
} from "../mastra-stream-failure.js";

describe("mastra stream failure helpers", () => {
  it("detects gateway context_length_exceeded payloads", () => {
    expect(
      isContextLengthExceededError(
        new Error(
          "Your input exceeds the context window of this model. context_length_exceeded"
        )
      )
    ).toBe(true);
    expect(
      isContextLengthExceededError({
        code: "context_length_exceeded",
        message: "Your input exceeds the context window of this model.",
      })
    ).toBe(true);
  });

  it("returns false for unrelated Error instances without recursing", () => {
    expect(
      isContextLengthExceededError(new Error("usageStore is not defined"))
    ).toBe(false);
  });

  it("maps context overflow to a stable harness message code", () => {
    expect(
      formatAgentStreamFailureMessage({
        code: "context_length_exceeded",
        message: "Your input exceeds the context window of this model.",
      })
    ).toBe(AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED);
  });

  it("returns an error when Mastra reports finishReason error without throwing", async () => {
    await expect(
      readMastraStreamFailure({
        finishReason: "error",
        getFullOutput: async () => ({
          finishReason: "error",
          error: new Error("context_length_exceeded"),
        }),
      })
    ).resolves.toEqual(new Error(AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED));
  });

  it("returns null for successful stream output", async () => {
    await expect(
      readMastraStreamFailure({
        finishReason: "stop",
      })
    ).resolves.toBeNull();
  });

  it("names a length-truncated stream instead of passing it as success", async () => {
    await expect(
      readMastraStreamFailure({
        finishReason: "length",
      })
    ).resolves.toEqual(new Error(AGENT_THREADS_OUTPUT_TRUNCATED));
  });

  it("names a content-filtered stream instead of passing it as success", async () => {
    await expect(
      readMastraStreamFailure({
        finishReason: "content-filter",
      })
    ).resolves.toEqual(new Error(AGENT_THREADS_CONTENT_FILTERED));
  });

  it("lets a truncated-but-visible answer pass — the user can see it", async () => {
    await expect(
      readMastraStreamFailure(
        { finishReason: "length" },
        { hasAssistantText: true }
      )
    ).resolves.toBeNull();
    await expect(
      readMastraStreamFailure(
        { finishReason: "content-filter" },
        { hasAssistantText: true }
      )
    ).resolves.toBeNull();
  });

  it("still reports finishReason 'error' when text was written", async () => {
    await expect(
      readMastraStreamFailure(
        {
          finishReason: "error",
          getFullOutput: async () => ({
            finishReason: "error",
            error: new Error("boom"),
          }),
        },
        { hasAssistantText: true }
      )
    ).resolves.toEqual(new Error("boom"));
  });
});
