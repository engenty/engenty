import { describe, expect, it } from "vitest";
import {
  AI_MODEL_PURPOSES,
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_PLANNING_CODING_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
  resolvePurposeModel,
} from "../model-purposes.js";

const noEnv = () => undefined;

describe("resolvePurposeModel provenance", () => {
  it("prefers session > agent > tenant > platform > default", () => {
    const layered = {
      purpose: "chat" as const,
      sessionOverride: "s/model",
      agentOverride: "a/model",
      tenantDefault: "t/model",
      readEnv: (k: string) => (k === "AI_CHAT_MODEL" ? "e/model" : undefined),
    };
    expect(resolvePurposeModel(layered)).toEqual({
      purpose: "chat",
      value: "s/model",
      source: "session",
    });
    expect(resolvePurposeModel({ ...layered, sessionOverride: null })).toEqual({
      purpose: "chat",
      value: "a/model",
      source: "agent",
    });
    expect(
      resolvePurposeModel({
        ...layered,
        sessionOverride: null,
        agentOverride: null,
      })
    ).toEqual({ purpose: "chat", value: "t/model", source: "tenant" });
    expect(
      resolvePurposeModel({
        purpose: "chat",
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "e/model" : undefined),
      })
    ).toEqual({ purpose: "chat", value: "e/model", source: "platform" });
  });

  it("falls back to the package default per purpose", () => {
    expect(resolvePurposeModel({ purpose: "chat", readEnv: noEnv }).value).toBe(
      DEFAULT_AI_CHAT_MODEL_ID
    );
    expect(
      resolvePurposeModel({ purpose: "safeguard", readEnv: noEnv }).value
    ).toBe(DEFAULT_AI_SAFEGUARD_MODEL_ID);
    expect(
      resolvePurposeModel({ purpose: "planning_coding", readEnv: noEnv }).value
    ).toBe(DEFAULT_AI_PLANNING_CODING_MODEL_ID);
  });

  it("routing falls back through coordinator and chat env keys", () => {
    expect(
      resolvePurposeModel({
        purpose: "routing",
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "chat/env" : undefined),
      })
    ).toEqual({ purpose: "routing", value: "chat/env", source: "platform" });
  });

  it("planning_coding never falls back to the chat env key", () => {
    expect(
      resolvePurposeModel({
        purpose: "planning_coding",
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "chat/env" : undefined),
      }).value
    ).toBe(DEFAULT_AI_PLANNING_CODING_MODEL_ID);
  });

  it("exposes the five tunable purposes in a stable order", () => {
    expect([...AI_MODEL_PURPOSES]).toEqual([
      "chat",
      "routing",
      "research",
      "planning_coding",
      "safeguard",
    ]);
  });
});

describe("resolvePurposeModel governance allow-list", () => {
  it("keeps a tenant pin that is on the allow-list", () => {
    expect(
      resolvePurposeModel({
        purpose: "chat",
        tenantDefault: "openai/gpt-5",
        allowedModels: ["openai/gpt-5", "openai/gpt-5-mini"],
        readEnv: noEnv,
      })
    ).toEqual({ purpose: "chat", value: "openai/gpt-5", source: "tenant" });
  });

  it("demotes a tenant pin outside the allow-list to platform/default", () => {
    // The tenant pinned a now-disallowed model; resolution must fall through to
    // the operator-controlled layers instead of returning the illegal pin.
    const resolved = resolvePurposeModel({
      purpose: "chat",
      tenantDefault: "anthropic/claude-opus-4-8",
      allowedModels: ["openai/gpt-5-mini"],
      readEnv: (k) => (k === "AI_CHAT_MODEL" ? "openai/gpt-5-mini" : undefined),
    });
    expect(resolved).toEqual({
      purpose: "chat",
      value: "openai/gpt-5-mini",
      source: "platform",
    });
  });

  it("does not filter platform/default values against the allow-list", () => {
    // The operator's own env/default choice is authoritative even if it is not
    // in the list (the list constrains tenant/session pins, not the platform).
    expect(
      resolvePurposeModel({
        purpose: "chat",
        allowedModels: ["openai/gpt-5-mini"],
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "openai/gpt-5" : undefined),
      })
    ).toEqual({ purpose: "chat", value: "openai/gpt-5", source: "platform" });
  });

  it("treats an empty allow-list as no restriction", () => {
    expect(
      resolvePurposeModel({
        purpose: "chat",
        tenantDefault: "openai/gpt-5",
        allowedModels: [],
        readEnv: noEnv,
      }).value
    ).toBe("openai/gpt-5");
  });
});
