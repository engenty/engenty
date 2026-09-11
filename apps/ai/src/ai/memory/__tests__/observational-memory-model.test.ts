import { DEFAULT_AI_CHAT_MODEL_ID } from "@engenty/ai-core";
import { afterEach, describe, expect, it } from "vitest";
import {
  observationalMemoryLanguageModel,
  resolveObservationalMemoryModelId,
} from "../observational-memory-model.js";

describe("observationalMemoryLanguageModel", () => {
  const origMemory = process.env.AI_MEMORY_MODEL;
  const origRouting = process.env.AI_ROUTING_MODEL;
  const origCoord = process.env.AI_COORDINATOR_MODEL;
  const origChat = process.env.AI_CHAT_MODEL;

  afterEach(() => {
    process.env.AI_MEMORY_MODEL = origMemory ?? "";
    process.env.AI_ROUTING_MODEL = origRouting ?? "";
    process.env.AI_COORDINATOR_MODEL = origCoord ?? "";
    process.env.AI_CHAT_MODEL = origChat ?? "";
  });

  it("uses an explicit configured model id", () => {
    expect(resolveObservationalMemoryModelId("anthropic/claude-sonnet-4")).toBe(
      "anthropic/claude-sonnet-4"
    );
  });

  it("falls back to the memory-purpose configured model", () => {
    process.env.AI_MEMORY_MODEL = "anthropic/claude-sonnet-4";
    process.env.AI_ROUTING_MODEL = "";
    process.env.AI_COORDINATOR_MODEL = "";
    process.env.AI_CHAT_MODEL = "";
    expect(resolveObservationalMemoryModelId()).toBe(
      "anthropic/claude-sonnet-4"
    );
    expect(resolveObservationalMemoryModelId("  ")).toBe(
      "anthropic/claude-sonnet-4"
    );
  });

  // The regression this purpose exists for: observational memory used to
  // resolve through `routing`, so a small bound router became the reflector and
  // truncated every rewrite (2026-08-28, `finishReason: "length"`). A router
  // pin must no longer reach it.
  it("ignores the routing tier", () => {
    process.env.AI_MEMORY_MODEL = "";
    process.env.AI_ROUTING_MODEL = "openai/gpt-oss-20b";
    process.env.AI_COORDINATOR_MODEL = "";
    process.env.AI_CHAT_MODEL = "";
    expect(resolveObservationalMemoryModelId()).not.toBe("openai/gpt-oss-20b");
    expect(resolveObservationalMemoryModelId()).toBe(DEFAULT_AI_CHAT_MODEL_ID);
  });

  it("does not default to google/gemini-2.5-flash", () => {
    process.env.AI_MEMORY_MODEL = "";
    process.env.AI_ROUTING_MODEL = "";
    process.env.AI_COORDINATOR_MODEL = "";
    process.env.AI_CHAT_MODEL = "";
    expect(resolveObservationalMemoryModelId()).toBe(DEFAULT_AI_CHAT_MODEL_ID);
    expect(resolveObservationalMemoryModelId()).not.toBe(
      "google/gemini-2.5-flash"
    );
  });

  it("returns an AI Gateway language model for provider/model ids", () => {
    const model = observationalMemoryLanguageModel("openai/gpt-oss-20b");
    expect(typeof model).toBe("object");
    expect(model).not.toBe("google/gemini-2.5-flash");
    expect(model).not.toBe("openai/gpt-oss-20b");
  });
});
