import { describe, expect, it } from "vitest";
import { buildChatSessionSearchText } from "../dal/chat-search/index.js";
import type { ThreadMessageRow, ThreadRow } from "../dal/threads/index.js";

const session: ThreadRow = {
  agent_id: "engenty.copilot",
  archived_at: null,
  created_at: "2026-05-17T00:00:00.000Z",
  created_by_user_id: "00000000-0000-4000-8000-000000000002",
  id: "00000000-0000-4000-8000-000000000010",
  metadata: {},
  route_context: { routeKey: "copilot" },
  status: "completed",
  summary: "A saved summary",
  tenant_id: "00000000-0000-4000-8000-000000000001",
  title: "Transcript title",
  updated_at: "2026-05-17T00:01:00.000Z",
  workspace_key: "chat",
};

function message(
  id: string,
  role: ThreadMessageRow["role"],
  parts: unknown
): ThreadMessageRow {
  return {
    author_user_id: role === "user" ? session.created_by_user_id : null,
    created_at: `2026-05-17T00:00:${id}.000Z`,
    id: `00000000-0000-4000-8000-0000000000${id}`,
    parts,
    role,
    thread_id: session.id,
    tenant_id: session.tenant_id,
  };
}

describe("buildChatSessionSearchText", () => {
  it("compacts title, summary, and role-prefixed transcript; excludes tool messages", () => {
    const text = buildChatSessionSearchText(session, [
      message("11", "user", [{ type: "text", text: "Find contacts" }]),
      message("12", "assistant", [{ type: "text", text: "Found Ada" }]),
      message("13", "tool", [{ type: "tool-result", text: "internal" }]),
    ]);

    expect(text).toContain("Transcript title");
    expect(text).toContain("A saved summary");
    expect(text).toContain("user: Find contacts");
    expect(text).toContain("assistant: Found Ada");
    expect(text).not.toContain("internal");
  });

  it("returns an empty string for a session with no searchable content", () => {
    const empty: ThreadRow = { ...session, summary: null, title: null };
    expect(buildChatSessionSearchText(empty, [])).toBe("");
    expect(
      buildChatSessionSearchText(empty, [
        message("14", "tool", [{ type: "tool-result", text: "internal" }]),
      ])
    ).toBe("");
  });
});
