import { describe, expect, it } from "vitest";
import {
  AI_MODEL_PURPOSES,
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CLASSIFIER_MODEL_ID,
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
      gateway: "vercel",
      purpose: "chat",
      value: "s/model",
      source: "session",
    });
    expect(resolvePurposeModel({ ...layered, sessionOverride: null })).toEqual({
      gateway: "vercel",
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
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: "t/model",
      source: "tenant",
    });
    expect(
      resolvePurposeModel({
        purpose: "chat",
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "e/model" : undefined),
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: "e/model",
      source: "platform",
    });
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
    expect(
      resolvePurposeModel({ purpose: "classifier", readEnv: noEnv }).value
    ).toBe(DEFAULT_AI_CLASSIFIER_MODEL_ID);
  });

  it("classifier prefers AI_INBOX_DIGEST_MODEL over AI_CLASSIFIER_MODEL", () => {
    expect(
      resolvePurposeModel({
        purpose: "classifier",
        readEnv: (k) => {
          if (k === "AI_INBOX_DIGEST_MODEL") {
            return "inbox/digest";
          }
          if (k === "AI_CLASSIFIER_MODEL") {
            return "shared/classifier";
          }
          return;
        },
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "classifier",
      value: "inbox/digest",
      source: "platform",
    });
  });

  it("routing falls back through coordinator and chat env keys", () => {
    expect(
      resolvePurposeModel({
        purpose: "routing",
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "chat/env" : undefined),
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "routing",
      value: "chat/env",
      source: "platform",
    });
  });

  it("planning_coding never falls back to the chat env key", () => {
    expect(
      resolvePurposeModel({
        purpose: "planning_coding",
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "chat/env" : undefined),
      }).value
    ).toBe(DEFAULT_AI_PLANNING_CODING_MODEL_ID);
  });

  it("exposes the tunable purposes in a stable order", () => {
    expect([...AI_MODEL_PURPOSES]).toEqual([
      "chat",
      "routing",
      "classifier",
      "research",
      "planning_coding",
      "safeguard",
      "memory",
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
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: "openai/gpt-5",
      source: "tenant",
    });
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
      gateway: "vercel",
      purpose: "chat",
      value: "openai/gpt-5-mini",
      source: "platform",
    });
  });

  it("filters the platform layer too, falling through to an allowed default", () => {
    // The platform layer used to be exempt from the list, on the theory that the
    // operator's own choice is authoritative. But the resolved id is handed
    // straight to `checkUsageLimits`, which does NOT exempt it — so an env value
    // outside the list produced a 429 on every turn. Resolution must land on
    // something the preflight will accept.
    expect(
      resolvePurposeModel({
        purpose: "chat",
        allowedModels: [DEFAULT_AI_CHAT_MODEL_ID],
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "openai/gpt-5" : undefined),
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: DEFAULT_AI_CHAT_MODEL_ID,
      source: "default",
    });
  });

  it("substitutes a granted model when every layer is disallowed", () => {
    // No layer yields a legal id — including the package default. Rather than
    // return an id the preflight will reject (bricking the tenant with no way
    // out from the picker), fall back to the first granted model.
    expect(
      resolvePurposeModel({
        purpose: "chat",
        allowedModels: ["anthropic/claude-sonnet-5"],
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "openai/gpt-5" : undefined),
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: "anthropic/claude-sonnet-5",
      source: "governance",
    });
  });

  it("honours a provider grant without any model listed", () => {
    expect(
      resolvePurposeModel({
        purpose: "chat",
        allowedProviders: ["openai"],
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "openai/gpt-5" : undefined),
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: "openai/gpt-5",
      source: "platform",
    });
  });

  it("ignores case and stray whitespace in the allow-list", () => {
    expect(
      resolvePurposeModel({
        purpose: "chat",
        allowedModels: [" OpenAI/GPT-5 "],
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "openai/gpt-5" : undefined),
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: "openai/gpt-5",
      source: "platform",
    });
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
