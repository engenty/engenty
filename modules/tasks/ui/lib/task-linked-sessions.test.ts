import { describe, expect, it } from "vitest";
import { filterTaskLinkedSessions } from "./task-linked-sessions.js";

describe("filterTaskLinkedSessions", () => {
  it("keeps sessions matching workspace_key or task route context", () => {
    const sessions = filterTaskLinkedSessions(
      [
        {
          agent_type_key: "tasks.assist",
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
  });
});
