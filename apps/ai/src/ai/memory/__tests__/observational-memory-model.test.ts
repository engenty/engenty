import {
  bindingsFromList,
  ModelRoleNotBoundError,
  setPlatformBindings,
} from "@engenty/ai-core";
import { afterEach, describe, expect, it } from "vitest";
import {
  observationalMemoryLanguageModel,
  resolveObservationalMemoryModelId,
} from "../observational-memory-model.js";

describe("observationalMemoryLanguageModel", () => {
  afterEach(() => {
    setPlatformBindings(undefined);
  });

  it("uses an explicit configured model id", () => {
    expect(resolveObservationalMemoryModelId("anthropic/claude-sonnet-4")).toBe(
      "anthropic/claude-sonnet-4"
    );
  });

  it("falls back to the fast-text binding", () => {
    setPlatformBindings(
      bindingsFromList([
        {
          gateway: "vercel",
          modelId: "anthropic/claude-sonnet-4",
          role: "fast_text",
        },
      ])
    );
    expect(resolveObservationalMemoryModelId()).toBe(
      "anthropic/claude-sonnet-4"
    );
    expect(resolveObservationalMemoryModelId("  ")).toBe(
      "anthropic/claude-sonnet-4"
    );
  });

  it("throws when fast_text is unbound, never Mastra's gemini default", () => {
    expect(() => resolveObservationalMemoryModelId()).toThrow(
      ModelRoleNotBoundError
    );
  });

  it("returns an AI Gateway language model for provider/model ids", () => {
    const model = observationalMemoryLanguageModel("openai/gpt-oss-20b");
    expect(typeof model).toBe("object");
    expect(model).not.toBe("google/gemini-2.5-flash");
    expect(model).not.toBe("openai/gpt-oss-20b");
  });
});
