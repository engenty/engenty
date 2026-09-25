import { describe, expect, it } from "vitest";
import {
  AGENT_THREADS_CONTENT_FILTERED,
  AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED,
  AGENT_THREADS_EMPTY_REPLY,
  AGENT_THREADS_GUARDRAIL_TRIPPED,
  AGENT_THREADS_MODEL_GATEWAY_UNCONFIGURED,
  AGENT_THREADS_OUTPUT_TRUNCATED,
  AGENT_THREADS_RUN_TIMED_OUT,
  AGENT_THREADS_STEP_LIMIT_REACHED,
  agentRunErrorCode,
  formatAgentStreamFailureMessage,
  isContextLengthExceededError,
  readMastraStreamFailure,
} from "../mastra-stream-failure.js";

describe("silent finishes are named", () => {
  it("names the step cap landing on a step that still wanted tools", async () => {
    await expect(
      readMastraStreamFailure({ finishReason: "tool-calls" })
    ).resolves.toEqual(new Error(AGENT_THREADS_STEP_LIMIT_REACHED));
    await expect(
      readMastraStreamFailure(
        { finishReason: "tool-calls" },
        { hasAssistantText: true }
      )
    ).resolves.toBeNull();
  });

  it("names a clean stop with nothing written", async () => {
    await expect(
      readMastraStreamFailure(
        { finishReason: "stop" },
        { hasAssistantText: false }
      )
    ).resolves.toEqual(new Error(AGENT_THREADS_EMPTY_REPLY));
  });

  it("names a guardrail tripwire, and the token limiter's as a context problem", async () => {
    await expect(
      readMastraStreamFailure(
        { finishReason: "stop" },
        { tripwire: { processorId: "moderation", reason: "blocked" } }
      )
    ).resolves.toEqual(new Error(AGENT_THREADS_GUARDRAIL_TRIPPED));
    await expect(
      readMastraStreamFailure(
        { finishReason: "tripwire" },
        { tripwire: { processorId: "token-limiter" } }
      )
    ).resolves.toEqual(new Error(AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED));
  });

  it("maps a Mastra timeout and DeepSeek's moderation 400 to named codes", () => {
    expect(
      formatAgentStreamFailureMessage(
        new Error(
          "Agent execution timed out after 5ms (modelSettings.timeout.totalMs)"
        )
      )
    ).toBe(AGENT_THREADS_RUN_TIMED_OUT);
    expect(
      formatAgentStreamFailureMessage(
        new Error(
          '{"name":"AI_TypeValidationError","value":{"error":{"message":"<400> InternalError.Algo.DataInspectionFailed: Output data may contain inappropriate content.","code":"data_inspection_failed"}}}'
        )
      )
    ).toBe(AGENT_THREADS_CONTENT_FILTERED);
  });

  it("gives every named failure its own durable error_code", () => {
    expect(agentRunErrorCode(AGENT_THREADS_RUN_TIMED_OUT)).toBe("run_timeout");
    expect(agentRunErrorCode(AGENT_THREADS_STEP_LIMIT_REACHED)).toBe(
      "step_limit"
    );
    expect(agentRunErrorCode(AGENT_THREADS_EMPTY_REPLY)).toBe("empty_reply");
    expect(agentRunErrorCode(AGENT_THREADS_GUARDRAIL_TRIPPED)).toBe("tripwire");
    expect(agentRunErrorCode(AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED)).toBe(
      "context_window_exceeded"
    );
    expect(agentRunErrorCode(AGENT_THREADS_MODEL_GATEWAY_UNCONFIGURED)).toBe(
      "model_gateway_unconfigured"
    );
    expect(agentRunErrorCode("anything else")).toBe("run_error");
  });

  it("names an unconfigured model gateway instead of a raw provider error", () => {
    expect(
      formatAgentStreamFailureMessage(
        new Error(
          'Model gateway "openrouter" is not configured: set OPENROUTER_API_KEY in platform settings.'
        )
      )
    ).toBe(AGENT_THREADS_MODEL_GATEWAY_UNCONFIGURED);
  });
});

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
      readMastraStreamFailure(
        {
          finishReason: "stop",
        },
        { hasAssistantText: true }
      )
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
