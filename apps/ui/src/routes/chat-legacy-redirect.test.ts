import { describe, expect, it } from "vitest";
import { resolveChatLegacyRedirectTarget } from "./chat-legacy-redirect.js";

describe("resolveChatLegacyRedirectTarget", () => {
  it("redirects legacy session ids to module chat", () => {
    const threadId = "550e8400-e29b-41d4-a716-446655440000";
    expect(resolveChatLegacyRedirectTarget(threadId)).toBe(
      `/mdl/engenty-copilot/chat/${threadId}`
    );
  });

  it("redirects /chat/new to module new chat", () => {
    expect(resolveChatLegacyRedirectTarget("new")).toBe(
      "/mdl/engenty-copilot/chat/new"
    );
    expect(resolveChatLegacyRedirectTarget(undefined)).toBe(
      "/mdl/engenty-copilot/chat/new"
    );
  });

  it("redirects invalid ids to new chat", () => {
    expect(resolveChatLegacyRedirectTarget("not-a-uuid")).toBe(
      "/mdl/engenty-copilot/chat/new"
    );
  });
});
