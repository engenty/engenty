import { describe, expect, it } from "vitest";
import {
  COPILOT_CHAT_NEW,
  copilotChatThreadPath,
  isFullPageCopilotChatRoute,
  localizeCopilotChatPath,
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

  it("reads a chat opened inside a space", () => {
    // `/s/<key>/copilot/chat/<id>` is where every `/mdl/` copilot deep link
    // lands once chat is a per-space surface. Parsing it as "not a chat route"
    // opened the last-active chat instead of the one the link named, and left
    // the URL frozen on the id it ignored.
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseCopilotChatPathname(`/s/matthias/copilot/chat/${id}`)).toEqual({
      kind: "thread",
      threadId: id,
    });
    expect(
      resolveCopilotChatThreadIdFromPathname(`/s/matthias/copilot/chat/${id}`)
    ).toBe(id);
    expect(isFullPageCopilotChatRoute(`/s/matthias/copilot/chat/${id}`)).toBe(
      true
    );
    expect(parseCopilotChatPathname("/s/company/copilot/chat/new")).toEqual({
      kind: "new",
    });
    expect(parseCopilotChatPathname("/s/company/copilot/chat")).toEqual({
      kind: "index",
    });
  });

  it("does not claim another module's space route", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(isFullPageCopilotChatRoute(`/s/company/tasks/chat/${id}`)).toBe(
      false
    );
    expect(
      resolveCopilotChatThreadIdFromPathname(`/s/company/tasks/chat/${id}`)
    ).toBeNull();
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

  it("keeps a space chat entry inside that space", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      localizeCopilotChatPath(
        copilotChatThreadPath(id),
        "/s/matthias/copilot/chat"
      )
    ).toBe(`/s/matthias/copilot/chat/${id}`);
    expect(
      localizeCopilotChatPath(
        COPILOT_CHAT_NEW,
        "/s/matthias/agents/contacts.manager"
      )
    ).toBe("/s/matthias/copilot/chat/new");
    expect(
      localizeCopilotChatPath(COPILOT_CHAT_NEW, "/mdl/engenty-copilot/chat")
    ).toBe(COPILOT_CHAT_NEW);
  });
});
