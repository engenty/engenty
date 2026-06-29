import { describe, expect, it } from "vitest";
import {
  AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED,
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
});
