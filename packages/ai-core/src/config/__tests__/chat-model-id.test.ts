import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_AI_CHAT_MODEL_ID,
  DEFAULT_AI_CODE_EXECUTION_MODEL_ID,
  DEFAULT_AI_SAFEGUARD_MODEL_ID,
  resolveChatModelId,
  resolveSafeguardModelId,
} from "../chat-model-id.js";

describe("resolveChatModelId", () => {
  const origChat = process.env.AI_CHAT_MODEL;
  const origCoord = process.env.AI_COORDINATOR_MODEL;
  const origCodeExec = process.env.AI_CODE_EXECUTION_MODEL;

  afterEach(() => {
    process.env.AI_CHAT_MODEL = origChat ?? "";
    process.env.AI_COORDINATOR_MODEL = origCoord ?? "";
    process.env.AI_CODE_EXECUTION_MODEL = origCodeExec ?? "";
  });

  it("uses override first for chat", () => {
    process.env.AI_CHAT_MODEL = "env/chat";
    expect(
      resolveChatModelId({
        purpose: "chat",
        override: "  custom/model  ",
        tenantDefault: "tenant/x",
      })
    ).toBe("custom/model");
  });

  it("uses tenantDefault before env for chat", () => {
    process.env.AI_CHAT_MODEL = "env/chat";
    expect(
      resolveChatModelId({
        purpose: "chat",
        tenantDefault: "tenant/chat",
      })
    ).toBe("tenant/chat");
  });

  it("uses AI_CHAT_MODEL for chat purpose", () => {
    process.env.AI_COORDINATOR_MODEL = "";
    process.env.AI_CHAT_MODEL = "env/chat-only";
    expect(resolveChatModelId({ purpose: "chat" })).toBe("env/chat-only");
  });

  it("uses coordinator then chat env for routing", () => {
    process.env.AI_COORDINATOR_MODEL = "env/coord";
    process.env.AI_CHAT_MODEL = "env/chat";
    expect(resolveChatModelId({ purpose: "routing" })).toBe("env/coord");
  });

  it("falls back from coordinator to chat for routing", () => {
    process.env.AI_COORDINATOR_MODEL = "";
    process.env.AI_CHAT_MODEL = "env/chat";
    expect(resolveChatModelId({ purpose: "routing" })).toBe("env/chat");
  });

  it("uses package default when nothing set", () => {
    process.env.AI_CHAT_MODEL = "";
    process.env.AI_COORDINATOR_MODEL = "";
    expect(resolveChatModelId({ purpose: "chat" })).toBe(
      DEFAULT_AI_CHAT_MODEL_ID
    );
    expect(resolveChatModelId({ purpose: "routing" })).toBe(
      DEFAULT_AI_CHAT_MODEL_ID
    );
  });

  it("respects readEnv injection", () => {
    expect(
      resolveChatModelId({
        purpose: "chat",
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "injected" : undefined),
      })
    ).toBe("injected");
  });

  describe("code_execution purpose", () => {
    it("uses override first", () => {
      expect(
        resolveChatModelId({
          purpose: "code_execution",
          override: "custom/code-exec",
          readEnv: () => "env/something",
        })
      ).toBe("custom/code-exec");
    });

    it("uses tenantDefault before env", () => {
      expect(
        resolveChatModelId({
          purpose: "code_execution",
          tenantDefault: "tenant/code-exec",
          readEnv: (k) =>
            k === "AI_CODE_EXECUTION_MODEL" ? "env/code-exec" : undefined,
        })
      ).toBe("tenant/code-exec");
    });

    it("uses AI_CODE_EXECUTION_MODEL and ignores AI_CHAT_MODEL", () => {
      expect(
        resolveChatModelId({
          purpose: "code_execution",
          readEnv: (k) => {
            if (k === "AI_CODE_EXECUTION_MODEL") {
              return "env/code-exec";
            }
            if (k === "AI_CHAT_MODEL") {
              return "env/chat";
            }
          },
        })
      ).toBe("env/code-exec");
    });

    it("does NOT fall back to AI_CHAT_MODEL — uses package default instead", () => {
      // AI_CHAT_MODEL may be set to a model incompatible with workspace tools (e.g. minimax);
      // code execution must never inherit it — always prefer the safe openai default.
      expect(
        resolveChatModelId({
          purpose: "code_execution",
          readEnv: (k) =>
            k === "AI_CHAT_MODEL" ? "minimax/incompatible-model" : undefined,
        })
      ).toBe(DEFAULT_AI_CODE_EXECUTION_MODEL_ID);
    });

    it("falls back to DEFAULT_AI_CODE_EXECUTION_MODEL_ID when nothing set", () => {
      process.env.AI_CODE_EXECUTION_MODEL = "";
      process.env.AI_CHAT_MODEL = "";
      expect(resolveChatModelId({ purpose: "code_execution" })).toBe(
        DEFAULT_AI_CODE_EXECUTION_MODEL_ID
      );
    });
  });
});

describe("resolveSafeguardModelId", () => {
  it("prefers override over tenantDefault and env", () => {
    expect(
      resolveSafeguardModelId({
        override: " openai/safeguard-override ",
        tenantDefault: "openai/tenant",
        readEnv: () => "openai/env",
      })
    ).toBe("openai/safeguard-override");
  });

  it("falls back to tenantDefault then env then package default", () => {
    expect(
      resolveSafeguardModelId({
        tenantDefault: "openai/tenant",
        readEnv: () => "openai/env",
      })
    ).toBe("openai/tenant");
    expect(
      resolveSafeguardModelId({
        readEnv: (k) => (k === "AI_SAFEGUARD_MODEL" ? "openai/env" : undefined),
      })
    ).toBe("openai/env");
    expect(resolveSafeguardModelId({ readEnv: () => undefined })).toBe(
      DEFAULT_AI_SAFEGUARD_MODEL_ID
    );
  });
});
