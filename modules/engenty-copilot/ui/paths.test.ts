import { describe, expect, it } from "vitest";
import {
  COPILOT_CHAT_NEW,
  copilotChatThreadPath,
  isFullPageCopilotChatRoute,
  parseCopilotChatPathname,
  resolveCopilotChatEntryPath,
  resolveCopilotChatThreadIdFromPathname,
} from "./paths.js";

describe("copilot chat paths", () => {
  it("parses index, new, and session routes", () => {
    expect(parseCopilotChatPathname("/mdl/engenty-copilot/chat")).toEqual({
      kind: "index",
    });
    expect(parseCopilotChatPathname(COPILOT_CHAT_NEW)).toEqual({
      kind: "new",
    });
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseCopilotChatPathname(copilotChatThreadPath(id))).toEqual({
      kind: "thread",
      threadId: id,
    });
  });

  it("flags invalid session ids", () => {
    expect(
      parseCopilotChatPathname("/mdl/engenty-copilot/chat/not-a-uuid")
    ).toEqual({
      kind: "invalid_thread",
      rawId: "not-a-uuid",
    });
  });

  it("resolves canonical session id from session URLs only", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      resolveCopilotChatThreadIdFromPathname(copilotChatThreadPath(id))
    ).toBe(id);
    expect(resolveCopilotChatThreadIdFromPathname(COPILOT_CHAT_NEW)).toBeNull();
    expect(
      resolveCopilotChatThreadIdFromPathname(
        "/mdl/engenty-copilot/chat/not-a-uuid"
      )
    ).toBeNull();
  });

  it("detects full-page copilot chat routes", () => {
    expect(isFullPageCopilotChatRoute("/mdl/engenty-copilot/chat")).toBe(true);
    expect(isFullPageCopilotChatRoute(COPILOT_CHAT_NEW)).toBe(true);
    expect(
      isFullPageCopilotChatRoute(
        "/mdl/engenty-copilot/chat/550e8400-e29b-41d4-a716-446655440000"
      )
    ).toBe(true);
    expect(isFullPageCopilotChatRoute("/chat")).toBe(false);
    expect(isFullPageCopilotChatRoute("/dashboard")).toBe(false);
  });

  it("resolves chat root redirect as last-active, then latest, then new", () => {
    const latest = "660e8400-e29b-41d4-a716-446655440001";
    const lastActive = "550e8400-e29b-41d4-a716-446655440000";

    expect(
      resolveCopilotChatEntryPath({
        lastActiveThreadId: lastActive,
        latestThreadIds: [latest],
      })
    ).toBe(copilotChatThreadPath(lastActive));

    expect(
      resolveCopilotChatEntryPath({
        latestThreadIds: [latest],
      })
    ).toBe(copilotChatThreadPath(latest));

    expect(resolveCopilotChatEntryPath({})).toBe(COPILOT_CHAT_NEW);
  });
});
