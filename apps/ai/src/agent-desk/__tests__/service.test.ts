import { AG_UI_OPEN_INTERRUPT_METADATA_KEY } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import type { ThreadRow } from "../../dal/threads/types.js";
import {
  AgentDeskNotFoundError,
  type AgentDeskServiceDependencies,
  buildAgentDeskFeed,
} from "../service.js";

const SPACE_ID = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "custom.researcher";

function thread(
  id: string,
  status: ThreadRow["status"],
  updatedAt: string,
  metadata: Record<string, unknown> = {}
): ThreadRow {
  return {
    agent_id: AGENT_ID,
    archived_at: null,
    created_at: updatedAt,
    created_by_user_id: "00000000-0000-4000-8000-000000000002",
    id,
    metadata,
    route_context: {},
    space_id: SPACE_ID,
    status,
    summary: null,
    tenant_id: "00000000-0000-4000-8000-000000000003",
    title: `Thread ${id}`,
    updated_at: updatedAt,
    visibility: "space",
    workspace_key: null,
  };
}

function dependencies(
  patch: Partial<AgentDeskServiceDependencies> = {}
): AgentDeskServiceDependencies {
  return {
    getAgent: async () => ({
      id: AGENT_ID,
      instructions: "Research carefully.",
      model: "test/model",
      name: "Researcher",
      skillIds: [],
      source: "database",
      toolIds: [],
    }),
    getSpaceSurface: async () => ({
      agents: [AGENT_ID],
      capabilities: [],
      connections: [],
      modules: [
        {
          agentAccess: "write",
          isRequired: false,
          moduleId: "tasks",
          recordScope: "space",
        },
      ],
      skills: [],
      spaceId: SPACE_ID,
    }),
    listSpaces: async () => [{ id: SPACE_ID, key: "company", name: "Company" }],
    listTasks: async () => [],
    listThreads: async () => [],
    ...patch,
  };
}

describe("buildAgentDeskFeed", () => {
  it("puts waiting and active engagements first and maps open interrupts", async () => {
    const feed = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: dependencies({
        listTasks: async () => [
          {
            checkout_run_id: null,
            completed_at: null,
            has_open_question: true,
            id: "task-question",
            identifier: "ENG-3",
            status: "todo",
            title: "Question task",
            updated_at: "2026-08-18T09:00:00.000Z",
          },
          {
            checkout_run_id: "run-1",
            completed_at: null,
            id: "task-active",
            identifier: "ENG-2",
            status: "in_progress",
            title: "Active task",
            updated_at: "2026-08-18T11:00:00.000Z",
          },
          {
            checkout_run_id: null,
            completed_at: "2026-08-18T12:00:00.000Z",
            id: "task-done",
            identifier: "ENG-1",
            status: "done",
            title: "Done task",
            updated_at: "2026-08-18T12:00:00.000Z",
          },
        ],
        listThreads: async () => [
          thread("idle", "idle", "2026-08-18T13:00:00.000Z"),
          thread("waiting", "idle", "2026-08-18T10:00:00.000Z", {
            [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: { interrupt_id: "int-1" },
          }),
        ],
      }),
      limit: 50,
      spaceId: SPACE_ID,
    });

    expect(feed.engagements.map(({ id, lane }) => [id, lane])).toEqual([
      ["conversation:waiting", "waiting"],
      ["task:task-question", "waiting"],
      ["task:task-active", "active"],
      ["conversation:idle", "conversation"],
      ["task:task-done", "completed"],
    ]);
    expect(feed.lane_counts).toMatchObject({
      active: 1,
      completed: 1,
      conversation: 1,
      waiting: 2,
    });
  });

  it("marks a routine fire's thread so readers can tell it from a chat", async () => {
    const fire = thread("fire", "idle", "2026-08-18T13:00:00.000Z");
    const feed = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: dependencies({
        listThreads: async () => [
          {
            ...fire,
            // An unattended run: nobody typed it, and it names its routine.
            // `ThreadRow` still types the author as non-null even though the
            // routines cutover writes NULL here on purpose — hence the cast.
            created_by_user_id: null as unknown as string,
            route_context: { routine_id: "01a03ab6" },
          },
          thread("chat", "idle", "2026-08-18T12:00:00.000Z"),
        ],
        listTasks: async () => [],
      }),
      limit: 50,
      spaceId: SPACE_ID,
    });

    expect(
      feed.engagements.map((engagement) => [
        engagement.id,
        engagement.metadata.routine_id,
      ])
    ).toEqual([
      ["conversation:fire", "01a03ab6"],
      ["conversation:chat", null],
    ]);
  });

  it("paginates with an opaque cursor without changing total counts", async () => {
    const deps = dependencies({
      listThreads: async () => [
        thread("new", "idle", "2026-08-18T13:00:00.000Z"),
        thread("old", "idle", "2026-08-18T12:00:00.000Z"),
      ],
    });
    const first = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: deps,
      limit: 1,
      spaceId: SPACE_ID,
    });
    const second = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      cursor: first.next_cursor ?? undefined,
      dependencies: deps,
      limit: 1,
      spaceId: SPACE_ID,
    });

    expect(first.engagements[0]?.id).toBe("conversation:new");
    expect(second.engagements[0]?.id).toBe("conversation:old");
    expect(second.lane_counts.conversation).toBe(2);
    expect(second.next_cursor).toBeNull();
  });

  it("rejects an agent that is not mounted in the authorized Space", async () => {
    await expect(
      buildAgentDeskFeed({
        agentId: AGENT_ID,
        dependencies: dependencies({
          getSpaceSurface: async () => ({
            agents: [],
            capabilities: [],
            connections: [],
            modules: [],
            skills: [],
            spaceId: SPACE_ID,
          }),
        }),
        limit: 50,
        spaceId: SPACE_ID,
      })
    ).rejects.toEqual(new AgentDeskNotFoundError("agent_not_mounted"));
  });

  it("rejects an unknown mounted agent and returns an empty feed cleanly", async () => {
    await expect(
      buildAgentDeskFeed({
        agentId: AGENT_ID,
        dependencies: dependencies({ getAgent: async () => undefined }),
        limit: 50,
        spaceId: SPACE_ID,
      })
    ).rejects.toEqual(new AgentDeskNotFoundError("agent_not_found"));

    const empty = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: dependencies(),
      limit: 50,
      spaceId: SPACE_ID,
    });
    expect(empty.engagements).toEqual([]);
    expect(empty.next_cursor).toBeNull();
    expect(empty.agent.skills).toEqual([]);
    expect(empty.agent.connectors).toEqual([]);
  });

  it("exposes the agent's skills and the space's connectors for the start header", async () => {
    const feed = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: dependencies({
        getAgent: async () => ({
          description: "Finds useful evidence.",
          engenty: "oval" as const,
          id: AGENT_ID,
          instructions: "Research carefully.",
          model: "test/model",
          name: "Researcher",
          skillIds: ["contacts-search", "contacts-search"],
          source: "database",
          toolIds: [],
        }),
        getSpaceSurface: async () => ({
          agents: [AGENT_ID],
          capabilities: [],
          connections: ["conn-1"],
          connectors: ["google-gmail"],
          modules: [
            {
              agentAccess: "write",
              isRequired: false,
              moduleId: "tasks",
              recordScope: "space",
            },
          ],
          skills: ["contacts-search"],
          spaceId: SPACE_ID,
        }),
      }),
      limit: 50,
      spaceId: SPACE_ID,
    });

    expect(feed.agent.description).toBe("Finds useful evidence.");
    expect(feed.agent.engenty).toBe("oval");
    expect(feed.agent.skills).toEqual([
      { id: "contacts-search", label: "Contacts Search" },
    ]);
    expect(feed.agent.connectors).toEqual([
      { id: "google-gmail", label: "Google Gmail" },
    ]);
  });

  it("carries agentScope so the desk can hide sender labels on personal rooms", async () => {
    const personal = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: dependencies({
        getAgent: async () => ({
          agentScope: "personal",
          id: AGENT_ID,
          instructions: "Research carefully.",
          model: "test/model",
          name: "Researcher",
          skillIds: [],
          source: "database",
          toolIds: [],
        }),
      }),
      limit: 50,
      spaceId: SPACE_ID,
    });
    const shared = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: dependencies({
        getAgent: async () => ({
          agentScope: "shared",
          id: AGENT_ID,
          instructions: "Research carefully.",
          model: "test/model",
          name: "Researcher",
          skillIds: [],
          source: "database",
          toolIds: [],
        }),
      }),
      limit: 50,
      spaceId: SPACE_ID,
    });
    const unset = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: dependencies(),
      limit: 50,
      spaceId: SPACE_ID,
    });

    expect(personal.agent.agentScope).toBe("personal");
    expect(shared.agent.agentScope).toBe("shared");
    expect(unset.agent.agentScope).toBeUndefined();
  });

  it("resolves declared starters for the requested locale and drops unmet conditions", async () => {
    const feed = await buildAgentDeskFeed({
      agentId: AGENT_ID,
      dependencies: dependencies({
        getAgent: async () => ({
          id: AGENT_ID,
          instructions: "Research carefully.",
          model: "test/model",
          name: "Researcher",
          skillIds: [],
          source: "database",
          starters: [
            {
              id: "mail",
              label: "Triage unread mail",
              prompt: "Triage unread mail.",
              locales: {
                de: {
                  label: "Ungelesene Mails sichten",
                  prompt: "Sichte ungelesene Mails.",
                },
              },
              when: { connector: "google-gmail" },
            },
            {
              id: "welcome",
              label: "Connect a mailbox",
              prompt: "Connect a mailbox.",
              when: { firstVisit: true },
            },
          ],
          toolIds: [],
        }),
        getSpaceSurface: async () => ({
          agents: [AGENT_ID],
          capabilities: [],
          connections: [],
          connectors: ["google-gmail"],
          modules: [],
          skills: [],
          spaceId: SPACE_ID,
        }),
        listThreads: async () => [
          thread("existing", "idle", "2026-08-18T13:00:00.000Z"),
        ],
      }),
      limit: 50,
      locale: "de-AT",
      spaceId: SPACE_ID,
    });

    expect(feed.agent.starters).toEqual([
      {
        id: "mail",
        label: "Ungelesene Mails sichten",
        prompt: "Sichte ungelesene Mails.",
      },
    ]);
  });
});
