import { describe, expect, it } from "vitest";
import type { AppsAiThreadRecord } from "../../ag-ui/apps-ai/apps-ai-thread-api.js";
import {
  organizeSpaceChats,
  type SpaceChatAgentInfo,
  spaceChatKind,
  spaceChatRows,
  spaceChatVisibility,
  transcriptShowsSenderLabels,
  unattendedRunIdOfThread,
} from "./space-chats-model.js";

function thread(
  patch: Partial<AppsAiThreadRecord> & { id: string }
): AppsAiThreadRecord {
  return {
    agent_id: "engenty.copilot",
    archived_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    created_by_user_id: "user-1",
    metadata: {},
    route_context: {},
    status: "idle",
    summary: null,
    tenant_id: "t1",
    title: null,
    updated_at: "2026-08-01T00:00:00.000Z",
    workspace_key: null,
    ...patch,
  } as AppsAiThreadRecord;
}

const AGENTS = new Map<string, SpaceChatAgentInfo>([
  ["engenty.copilot", { id: "engenty.copilot", name: "Copilot" }],
  ["engenty.coordinator", { id: "engenty.coordinator", name: "Coordinator" }],
  ["analyst", { id: "analyst", name: "Analyst" }],
]);

describe("what a conversation is", () => {
  it("reads the kind off the route context, desk when unmarked", () => {
    expect(spaceChatKind({ route_context: { room: true } })).toBe("room");
    expect(spaceChatKind({ route_context: { dm: true } })).toBe("dm");
    expect(spaceChatKind({ route_context: {} })).toBe("desk");
  });

  it("reads visibility off the thread, space when absent", () => {
    expect(spaceChatVisibility("private")).toBe("private");
    expect(spaceChatVisibility(undefined)).toBe("space");
    expect(spaceChatVisibility(null)).toBe("space");
  });

  it("shows sender labels wherever more than one person can talk", () => {
    expect(transcriptShowsSenderLabels({ agentScope: "personal" })).toBe(false);
    expect(
      transcriptShowsSenderLabels({
        agentScope: "shared",
        routeContext: { dm: true },
      })
    ).toBe(false);
    expect(transcriptShowsSenderLabels({ agentScope: "shared" })).toBe(true);
    expect(transcriptShowsSenderLabels({ routeContext: { room: true } })).toBe(
      true
    );
  });
});

describe("unattended runs", () => {
  it("recognises a routine FIRE by the field the desk feed reads", () => {
    expect(
      unattendedRunIdOfThread(
        thread({ id: "a", route_context: { routine_id: "r1" } })
      )
    ).toBe("r1");
    expect(unattendedRunIdOfThread(thread({ id: "b" }))).toBeNull();
    expect(
      unattendedRunIdOfThread(
        thread({ id: "c", route_context: { routine_id: "  " } })
      )
    ).toBeNull();
  });

  it("recognises a workflow run, which stamps metadata and no route context", () => {
    expect(
      unattendedRunIdOfThread(
        thread({
          id: "job",
          metadata: {
            routine_id: "01a039f8",
            source: "workflow-run",
            workflow_id: "01a039fa",
          },
          route_context: {},
        })
      )
    ).toBe("01a039f8");
    expect(
      unattendedRunIdOfThread(
        thread({ id: "job2", metadata: { source: "workflow-run" } })
      )
    ).toBe("workflow-run");
  });

  it("never appear as chats — a ten-minute routine would bury the real ones", () => {
    const rows = spaceChatRows({
      agentsById: AGENTS,
      threads: [
        thread({
          agent_id: "analyst",
          id: "fire",
          route_context: { routine_id: "r1" },
        }),
        thread({
          agent_id: "workflow:01a039fa",
          id: "job",
          metadata: { source: "workflow-run" },
        }),
        thread({ agent_id: "analyst", id: "chat" }),
      ],
    });
    expect(rows.map((row) => row.id)).toEqual(["chat"]);
  });
});

describe("rows", () => {
  it("are newest first", () => {
    const rows = spaceChatRows({
      agentsById: AGENTS,
      threads: [
        thread({ id: "old", updated_at: "2026-08-01T00:00:00.000Z" }),
        thread({ id: "new", updated_at: "2026-08-09T00:00:00.000Z" }),
      ],
    });
    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("keep a thread whose agent is gone, labelled with its id", () => {
    const rows = spaceChatRows({
      agentsById: AGENTS,
      threads: [thread({ agent_id: "retired.bot", id: "x" })],
    });
    expect(rows[0]?.agentName).toBe("retired.bot");
    expect(rows[0]?.visibility).toBe("space");
  });

  it("match the query against the title AND the agent name", () => {
    const threads = [
      thread({ id: "a", title: "Quarterly numbers" }),
      thread({ agent_id: "analyst", id: "b", title: "Nothing to see" }),
    ];
    expect(
      spaceChatRows({ agentsById: AGENTS, query: " quarter ", threads }).map(
        (row) => row.id
      )
    ).toEqual(["a"]);
    expect(
      spaceChatRows({ agentsById: AGENTS, query: "analyst", threads }).map(
        (row) => row.id
      )
    ).toEqual(["b"]);
  });
});

describe("grouping", () => {
  it("splits by kind first — rooms, desks, DMs — and the desks by agent", () => {
    const groups = organizeSpaceChats({
      agentsById: AGENTS,
      threads: [
        thread({ id: "desk", updated_at: "2026-08-09T00:00:00.000Z" }),
        thread({
          agent_id: "engenty.coordinator",
          id: "room",
          route_context: { room: true },
          updated_at: "2026-08-08T00:00:00.000Z",
        }),
        thread({
          agent_id: "analyst",
          id: "dm",
          route_context: { dm: true },
          updated_at: "2026-08-07T00:00:00.000Z",
        }),
      ],
    });
    expect(groups.map((group) => group.kind)).toEqual(["room", "desk", "dm"]);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(["room"]);
    expect(groups[1]?.agents.map((agent) => agent.agentId)).toEqual([
      "engenty.copilot",
    ]);
    expect(groups[2]?.rows.map((row) => row.id)).toEqual(["dm"]);
  });

  it("lists the directory's rooms the viewer is not in, unjoined", () => {
    const groups = organizeSpaceChats({
      agentsById: AGENTS,
      directory: [
        {
          joined: false,
          members: [
            { agent_id: "analyst" },
            { agent_id: "engenty.coordinator" },
          ],
          session: {
            agent_id: "analyst",
            created_by_user_id: "user-2",
            id: "open-room",
            title: "Launch",
            updated_at: "2026-08-10T00:00:00.000Z",
            visibility: "space",
          },
        },
        {
          joined: true,
          members: [{ agent_id: "engenty.coordinator" }],
          session: {
            agent_id: "engenty.coordinator",
            created_by_user_id: "user-1",
            id: "room",
            title: "Mine",
            updated_at: "2026-08-08T00:00:00.000Z",
            visibility: "private",
          },
        },
      ],
      threads: [
        thread({
          agent_id: "engenty.coordinator",
          id: "room",
          route_context: { room: true },
          title: "Mine",
          updated_at: "2026-08-08T00:00:00.000Z",
        }),
      ],
    });
    expect(groups).toHaveLength(1);
    expect(
      groups[0]?.rows.map((row) => [row.id, row.joined, row.memberAgentIds])
    ).toEqual([
      ["open-room", false, ["analyst", "engenty.coordinator"]],
      ["room", true, ["engenty.coordinator"]],
    ]);
  });

  it("orders agents by their most recent conversation, not by name", () => {
    const groups = organizeSpaceChats({
      agentsById: AGENTS,
      threads: [
        thread({
          agent_id: "analyst",
          id: "recent",
          updated_at: "2026-08-09T00:00:00.000Z",
        }),
        thread({
          agent_id: "engenty.coordinator",
          id: "stale",
          updated_at: "2026-03-01T00:00:00.000Z",
        }),
      ],
    });
    expect(groups[0]?.agents.map((agent) => agent.agentName)).toEqual([
      "Analyst",
      "Coordinator",
    ]);
  });

  it("drops an empty group rather than explaining a distinction that is absent", () => {
    const groups = organizeSpaceChats({
      agentsById: AGENTS,
      threads: [thread({ agent_id: "engenty.coordinator", id: "only" })],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("desk");
    expect(groups[0]?.total).toBe(1);
  });

  it("is empty when the space has no conversations", () => {
    expect(organizeSpaceChats({ agentsById: AGENTS, threads: [] })).toEqual([]);
  });
});
