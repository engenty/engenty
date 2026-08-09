import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.hoisted(() => vi.fn());
const readAiGatewayApiKeyFromEnv = vi.hoisted(() => vi.fn(() => "test-key"));

vi.mock("ai", () => ({ generateText }));
vi.mock("@engenty/ai-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@engenty/ai-core")>();
  return {
    ...actual,
    readAiGatewayApiKeyFromEnv,
    resolveChatModelId: () => "vendor/fixture-router",
  };
});

import {
  resolveAutoEffort,
  resolveEffortForRun,
} from "../resolve-auto-effort.js";

describe("resolveAutoEffort", () => {
  beforeEach(() => {
    generateText.mockReset();
    readAiGatewayApiKeyFromEnv.mockReturnValue("test-key");
  });

  it("skips the router when heuristics are certain (coding)", async () => {
    const result = await resolveAutoEffort({
      text: "Refactor the auth module across files",
    });
    expect(result).toMatchObject({
      effort: "high",
      source: "heuristic",
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("skips the router for tool-shaped asks (medium floor)", async () => {
    const result = await resolveAutoEffort({
      text: "Create a contact for Acme Corp",
    });
    expect(result).toMatchObject({
      effort: "medium",
      source: "heuristic",
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("skips the router for greetings (low)", async () => {
    const result = await resolveAutoEffort({ text: "hi" });
    expect(result).toMatchObject({ effort: "low", source: "heuristic" });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("calls the cheap router only when ambiguous", async () => {
    generateText.mockResolvedValue({ text: "high" });
    const result = await resolveAutoEffort({
      text: "Can you help me think through how our onboarding should work for enterprise customers next quarter?",
    });
    expect(generateText).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ effort: "high", source: "router" });
  });

  it("falls back to medium when the router times out", async () => {
    generateText.mockImplementation(() => new Promise(() => {}));
    const result = await resolveAutoEffort({
      text: "Can you help me think through how our onboarding should work for enterprise customers next quarter?",
      timeoutMs: 20,
    });
    expect(result.source).toBe("fallback");
    expect(result.effort).toBe("medium");
  });

  it("clamps router/heuristic results to the plan grant", async () => {
    const result = await resolveAutoEffort({
      allowedEfforts: ["low"],
      text: "Refactor the auth module across files",
    });
    expect(result.effort).toBe("low");
  });

  it("short-circuits when the plan only grants one tier", async () => {
    const result = await resolveAutoEffort({
      allowedEfforts: ["medium"],
      text: "anything goes here but we never classify",
    });
    expect(result).toMatchObject({
      effort: "medium",
      source: "ceiling",
    });
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("resolveEffortForRun", () => {
  beforeEach(() => {
    generateText.mockReset();
  });

  it("passes explicit picks through (clamped)", async () => {
    await expect(
      resolveEffortForRun({
        allowedEfforts: ["low", "medium"],
        choice: "high",
        text: "whatever",
      })
    ).resolves.toEqual({ autoResolved: false, effort: "medium" });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("skips Auto when an expert model pin is set", async () => {
    await expect(
      resolveEffortForRun({
        choice: "auto",
        modelIdOverride: "openai/gpt-5",
        text: "Refactor everything",
      })
    ).resolves.toEqual({ autoResolved: false, effort: null });
  });

  it("sizes Auto turns", async () => {
    await expect(
      resolveEffortForRun({
        choice: "auto",
        text: "hi",
      })
    ).resolves.toMatchObject({
      autoResolved: true,
      effort: "low",
    });
  });
});
