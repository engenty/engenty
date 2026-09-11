import { describe, expect, it } from "vitest";
import {
  filterTaskLinkedSessions,
  mergeTaskLinkedSessions,
  type TaskLinkedSessionRow,
} from "./task-linked-sessions.js";

describe("filterTaskLinkedSessions", () => {
  it("keeps sessions matching workspace_key or task route context", () => {
    const sessions = filterTaskLinkedSessions(
      [
        {
          agent_id: "tasks.assist",
          id: "session-a",
          route_context: { task_id: "task-1" },
          title: "Task binding",
          updated_at: "2026-05-23T10:00:00.000Z",
          workspace_key: null,
        },
        {
          agent_type_key: "tasks.assist",
          id: "session-b",
          route_context: {},
          title: "Workspace match",
          updated_at: "2026-05-23T11:00:00.000Z",
          workspace_key: "task:ENG-1",
        },
        {
          agent_type_key: "engenty.copilot",
          id: "session-c",
          route_context: {},
          title: "Unrelated",
          updated_at: "2026-05-23T09:00:00.000Z",
          workspace_key: "chat",
        },
      ],
      {
        taskId: "task-1",
        workspaceKey: "task:ENG-1",
        limit: 5,
      }
    );

    expect(sessions.map((row) => row.id)).toEqual(["session-a", "session-b"]);
    expect(sessions[0]?.agent_type_key).toBe("tasks.assist");
  });
});

describe("mergeTaskLinkedSessions", () => {
  const row = (id: string, kind: "agent" | "chat"): TaskLinkedSessionRow => ({
    agent_type_key: "engenty.coordinator",
    id,
    kind,
    title: null,
    updated_at: "2026-08-17T10:00:00.000Z",
    workspace_key: null,
  });

  it("puts the executor's own threads first", () => {
    const merged = mergeTaskLinkedSessions(
      [row("agent-1", "agent")],
      [row("chat-1", "chat")]
    );
    expect(merged.map((r) => r.id)).toEqual(["agent-1", "chat-1"]);
  });

  it("dedupes a thread that satisfies both queries, keeping it an agent thread", () => {
    const merged = mergeTaskLinkedSessions(
      [row("both", "agent")],
      [row("both", "chat")]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind).toBe("agent");
  });

  it("caps the merged list", () => {
    const merged = mergeTaskLinkedSessions(
      [row("a", "agent"), row("b", "agent")],
      [row("c", "chat")],
      2
    );
    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
