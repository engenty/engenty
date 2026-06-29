import { describe, expect, it } from "vitest";
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
} from "../dal/agent-sessions/index.js";
import { buildAiChatSearchDocumentsForSession } from "../dal/chat-search/index.js";

const session: AgentSessionRow = {
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
  role: AgentSessionMessageRow["role"],
  parts: unknown
): AgentSessionMessageRow {
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

describe("buildAiChatSearchDocumentsForSession", () => {
  it("indexes session text and searchable transcript messages", () => {
    const documents = buildAiChatSearchDocumentsForSession(session, [
      message("11", "user", [{ type: "text", text: "Find contacts" }]),
      message("12", "assistant", [{ type: "text", text: "Found Ada" }]),
      message("13", "tool", [{ type: "tool-result", text: "internal" }]),
    ]);

    expect(documents).toHaveLength(3);
    expect(documents[0]).toMatchObject({
      agent_id: "engenty.copilot",
      document_type: "session",
      thread_id: session.id,
      workspace_key: "chat",
    });
    expect(documents[0]?.text).toContain("Transcript title");
    expect(documents[0]?.text).toContain("user: Find contacts");
    expect(documents.map((document) => document.role)).toEqual([
      undefined,
      "user",
      "assistant",
    ]);
    expect(
      documents.some((document) => document.text.includes("internal"))
    ).toBe(false);
  });
});
