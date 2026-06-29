import { describe, expect, it } from "vitest";
import { resolveAgentChatTransportBlocker } from "./agent-chat-transport.js";

describe("resolveAgentChatTransportBlocker", () => {
  it("returns scope when tenant or user is missing", () => {
    expect(
      resolveAgentChatTransportBlocker({
        resolvedAiBase: "http://127.0.0.1:8788",
        scopeReady: false,
      })
    ).toBe("scope");
  });

  it("returns service when ai base url is unset", () => {
    expect(
      resolveAgentChatTransportBlocker({
        resolvedAiBase: undefined,
        scopeReady: true,
      })
    ).toBe("service");
  });

  it("returns null when transport is ready", () => {
    expect(
      resolveAgentChatTransportBlocker({
        resolvedAiBase: "http://127.0.0.1:8788",
        scopeReady: true,
      })
    ).toBeNull();
  });
});
