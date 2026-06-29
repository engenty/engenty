import { CHAT_THREAD_SEARCH_METHOD } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import {
  buildChatThreadSearchMethod,
  CORE_CHAT_THREAD_SEARCH_REMOVED_MESSAGE,
} from "../core-ai-methods-removed.js";

const baseCtx = {
  config: {} as Record<string, unknown>,
  pluginConfig: {},
  dataDir: "",
  resolvePath: (p: string) => p,
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
  auth: {
    principalId: "user-1",
    tenantId: "tenant-1",
    scopeId: "scope-1",
  },
};

describe("buildChatThreadSearchMethod (retired stub)", () => {
  it("exposes stable method name", () => {
    const method = buildChatThreadSearchMethod();
    expect(method.name).toBe(CHAT_THREAD_SEARCH_METHOD);
  });

  it("handler fails fast with removal message", async () => {
    const method = buildChatThreadSearchMethod();
    await expect(method.handler({ query: "hello" }, baseCtx)).rejects.toThrow(
      CORE_CHAT_THREAD_SEARCH_REMOVED_MESSAGE
    );
  });
});
