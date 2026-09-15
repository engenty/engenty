import { beforeEach, describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  messageAgentInputSchema,
  messageAgentStubTool,
} from "../../../../ai/tools/message-agent-tool.js";
import { deliverToRoom } from "../../rooms/deliver.js";
import type { DelegationToolDeps } from "../delegate-tool.js";
import { runDelegatedSpecialist } from "../delegate-tool.js";
import { createMessageAgentTool } from "../message-agent-tool.js";

vi.mock("../delegate-tool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../delegate-tool.js")>();
  return {
    ...actual,
    runDelegatedSpecialist: vi.fn(async (_deps, input) => ({
      agent: input.alias,
      ok: true,
      result: `answered:${input.agentId}`,
    })),
  };
});

vi.mock("../../rooms/deliver.js", () => ({
  deliverToRoom: vi.fn(async (input) => ({
    addressed: input.mentions,
    agentTurns: 1,
    ok: true,
    roomId: input.roomId,
  })),
}));

vi.mock("../../threads/specialist-chat-thread.js", () => ({
  resolveSpecialistChatThread: vi.fn(async (input) =>
    input.spaceId ? `room:${input.spaceId}:${input.agentId}` : null
  ),
}));

vi.mock("../../threads/agent-pair-thread.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../threads/agent-pair-thread.js")>();
  return {
    ...actual,
    resolveAgentPairThread: vi.fn(async (input) => ({
      agentId: input.colleagueId,
      id: `pair:${input.spaceId}:${input.senderId}:${input.colleagueId}`,
    })),
  };
});

type MessageAgentDeps = DelegationToolDeps & {
  mountedAgentIds: ReadonlySet<string>;
  parentAgentId: string;
};

function deps(
  overrides: Partial<DelegationToolDeps> & {
    mountedAgentIds?: ReadonlySet<string>;
    parentAgentId?: string;
  } = {}
): MessageAgentDeps {
  return {
    mountedAgentIds: overrides.mountedAgentIds ?? new Set(["sales.researcher"]),
    onProgress: vi.fn(),
    parentAgentId: overrides.parentAgentId ?? "engenty.coordinator",
    parentThreadId: "thread-parent",
    registry: {
      getAgentConfig: vi.fn(async () => null),
    } as unknown as DelegationToolDeps["registry"],
    resolveChildWorkspace: vi.fn(async () => undefined),
    scope: {
      credential: { kind: "user" as const, token: "tok" },
      isSuperAdmin: false,
      isTenantAdmin: true,
      tenantId: "tenant-1",
      tenantRole: "admin",
      userId: "user-1",
    },
    store: {
      appendMessage: vi.fn(async () => ({ message: {} })),
      createThread: vi.fn(async () => undefined),
      listAgentMembers: vi.fn(async () => []),
    } as never,
    ...overrides,
  };
}

function runInResolvedSpace<T>(
  agentIds: ReadonlySet<string>,
  fn: () => Promise<T>
): Promise<T> {
  return engentyToolsRunAls.run(
    {
      space: {
        agentIds,
        allConnectorPrefixes: new Set(),
        connectorPrefixes: new Set(),
        moduleIds: new Set(),
        readOnlyModuleIds: new Set(),
        spaceId: "space-1",
      },
    },
    fn
  );
}

describe("createMessageAgentTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses messaging yourself", async () => {
    const tool = createMessageAgentTool(deps());
    const result = (await tool.execute!(
      { agent_id: "engenty.coordinator", mode: "ask", message: "hi" },
      {} as never
    )) as { code: string; ok: boolean };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("cannot_message_self");
    expect(runDelegatedSpecialist).not.toHaveBeenCalled();
  });

  it("refuses an unresolved Space", async () => {
    const tool = createMessageAgentTool(deps());
    const result = await engentyToolsRunAls.run(
      {
        space: {
          claimed_space_id: "space-1",
          kind: "unresolved",
          reason: "forbidden",
        },
      } as never,
      () =>
        tool.execute!(
          { agent_id: "sales.researcher", mode: "ask", message: "brief" },
          {} as never
        )
    );
    expect(result).toMatchObject({ code: "space_unresolved", ok: false });
  });

  it("refuses an agent the Space does not mount", async () => {
    const tool = createMessageAgentTool(deps());
    const result = (await runInResolvedSpace(
      new Set(["sales.researcher"]),
      () =>
        tool.execute!(
          { agent_id: "invoices.manager", mode: "ask", message: "brief" },
          {} as never
        ) as Promise<unknown>
    )) as { code: string; ok: boolean };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not_mounted");
  });

  it("denies every target when the resolved Space mounts no agents", async () => {
    const tool = createMessageAgentTool(deps({ mountedAgentIds: new Set() }));
    const result = (await runInResolvedSpace(new Set(), () =>
      tool.execute!(
        { agent_id: "sales.researcher", mode: "ask", message: "brief" },
        {} as never
      )
    )) as { code: string; ok: boolean };
    expect(result).toMatchObject({ code: "not_mounted", ok: false });
    expect(runDelegatedSpecialist).not.toHaveBeenCalled();
  });

  it("uses the tenant registry for an intentional no-Space run", async () => {
    const tool = createMessageAgentTool(deps({ mountedAgentIds: new Set() }));
    const result = (await tool.execute!(
      {
        agent_id: "invoices.manager",
        mode: "ask",
        message: "tenant-global brief",
      },
      {} as never
    )) as { ok: boolean; result: string };
    expect(result).toMatchObject({
      ok: true,
      result: "answered:invoices.manager",
    });
  });

  it("delegates to a mounted specialist", async () => {
    const tool = createMessageAgentTool(deps());
    const result = (await runInResolvedSpace(
      new Set(["sales.researcher"]),
      () =>
        tool.execute!(
          {
            agent_id: "sales.researcher",
            mode: "ask",
            message: "research Acme",
          },
          {} as never
        ) as Promise<unknown>
    )) as { ok: boolean; result: string };
    expect(result.ok).toBe(true);
    expect(result.result).toBe("answered:sales.researcher");
    expect(runDelegatedSpecialist).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agentId: "sales.researcher",
        brief: expect.stringContaining("research Acme"),
        // In a Space the colleague answers in the pair's own thread.
        childThreadId: "pair:space-1:engenty.coordinator:sales.researcher",
      })
    );
  });

  it("ask marks the colleague's desk room with a pointer to the pair thread", async () => {
    const store = {
      appendMessage: vi.fn(async () => ({ message: {} })),
      createThread: vi.fn(async () => undefined),
    };
    const tool = createMessageAgentTool(deps({ store: store as never }));
    await runInResolvedSpace(new Set(["sales.researcher"]), () =>
      tool.execute!(
        { agent_id: "sales.researcher", mode: "ask", message: "research Acme" },
        {} as never
      )
    );
    // Ask: the "Message from …" marker, then the colleague's reply preview.
    expect(store.appendMessage).toHaveBeenCalledTimes(2);
    expect(store.appendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        authorUserId: "user-1",
        metadata: {
          engenty_agent_message: {
            agent_id: "engenty.coordinator",
            thread_agent_id: "sales.researcher",
            thread_id: "pair:space-1:engenty.coordinator:sales.researcher",
          },
        },
        role: "user",
        threadId: "room:space-1:sales.researcher",
      })
    );
    const text = (
      store.appendMessage.mock.calls as unknown as [
        { parts: { text: string }[] },
      ][]
    )[0]?.[0]?.parts[0]?.text;
    expect(text).toContain("**Message from engenty.coordinator**");
    expect(text).toContain("research Acme");
    expect(store.appendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        metadata: expect.objectContaining({
          engenty_agent_message: expect.objectContaining({
            kind: "reply",
            reply_to_agent_id: "engenty.coordinator",
          }),
        }),
        role: "assistant",
        threadId: "room:space-1:sales.researcher",
      })
    );
  });

  it("marks the desk with the whole message, however long", async () => {
    // The person reads the desk and answers there; that answer's run reads
    // this row as the brief. A preview cut here was answered as a cut brief.
    const store = {
      appendMessage: vi.fn(async () => ({ message: {} })),
      createThread: vi.fn(async () => undefined),
    };
    const tool = createMessageAgentTool(deps({ store: store as never }));
    const brief = `Zweck: Mitarbeitende erfassen eine Reiseabrechnung. ${"Detail. ".repeat(120)}Ende.`;
    await runInResolvedSpace(new Set(["sales.researcher"]), () =>
      tool.execute!(
        { agent_id: "sales.researcher", mode: "ask", message: brief },
        {} as never
      )
    );
    const text = (
      store.appendMessage.mock.calls as unknown as [
        { parts: { text: string }[] },
      ][]
    )[0]?.[0]?.parts[0]?.text;
    expect(text).toContain("Ende.");
    expect(text).not.toContain("…");
  });

  it("ask without a Space keeps a throwaway thread and marks nothing", async () => {
    const store = {
      appendMessage: vi.fn(async () => ({ message: {} })),
      createThread: vi.fn(async () => undefined),
    };
    const tool = createMessageAgentTool(
      deps({ mountedAgentIds: new Set(), store: store as never })
    );
    await tool.execute!(
      { agent_id: "invoices.manager", mode: "ask", message: "brief" },
      {} as never
    );
    expect(store.appendMessage).not.toHaveBeenCalled();
    expect(runDelegatedSpecialist).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ childThreadId: expect.anything() })
    );
  });

  it("describes self-contained briefs without invented data handoffs", async () => {
    const tool = createMessageAgentTool(deps());
    expect(tool.description).not.toContain("/data");
    expect(messageAgentInputSchema.shape.message.description).not.toContain(
      "/data"
    );
    expect(messageAgentStubTool.description).not.toContain("/data");
    const leaf = await messageAgentStubTool.execute!(
      { agent_id: "sales.researcher", mode: "ask", message: "brief" },
      {} as never
    );
    expect(JSON.stringify(leaf)).not.toContain("/data");
  });

  it("notify hands the message to the colleague's room in this Space and returns at once", async () => {
    const registry = {
      getAgentConfig: vi.fn(async (id: string) =>
        id === "sales.researcher"
          ? { id, name: "Sales Researcher" }
          : { id, name: "Chief of Staff" }
      ),
    } as unknown as DelegationToolDeps["registry"];
    const tool = createMessageAgentTool(
      deps({ parentAgentId: "chief-of-staff", registry })
    );
    const result = (await runInResolvedSpace(
      new Set(["sales.researcher"]),
      () =>
        tool.execute!(
          {
            agent_id: "sales.researcher",
            message: "Find three suppliers.",
            mode: "notify",
          },
          { agent: { toolCallId: "call-7" } } as never
        ) as Promise<unknown>
    )) as { child_thread_id: string; mode: string; ok: boolean };
    expect(result).toMatchObject({
      child_thread_id: "pair:space-1:chief-of-staff:sales.researcher",
      mode: "notify",
      ok: true,
    });
    expect(runDelegatedSpecialist).not.toHaveBeenCalled();
    // The hand-off is a message in the pair's room; the colleague takes the
    // next turn there. No child run, no depth.
    expect(deliverToRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { agentId: "chief-of-staff", name: "Chief of Staff" },
        mentions: ["sales.researcher"],
        roomId: "pair:space-1:chief-of-staff:sales.researcher",
        text: "Find three suppliers.",
      })
    );
  });

  it("notify inside a room the colleague is in stays in that room", async () => {
    const store = {
      appendMessage: vi.fn(async () => ({ message: {} })),
      createThread: vi.fn(async () => undefined),
      listAgentMembers: vi.fn(async () => [
        { agent_id: "chief-of-staff", role: "host" },
        { agent_id: "sales.researcher", role: "member" },
      ]),
    };
    const tool = createMessageAgentTool(
      deps({ parentAgentId: "chief-of-staff", store: store as never })
    );
    const result = (await runInResolvedSpace(
      new Set(["sales.researcher"]),
      () =>
        tool.execute!(
          {
            agent_id: "sales.researcher",
            message: "Your move.",
            mode: "notify",
          },
          { agent: { toolCallId: "call-8" } } as never
        ) as Promise<unknown>
    )) as { child_thread_id: string; ok: boolean };
    expect(result.ok).toBe(true);
    expect(result.child_thread_id).toBe("thread-parent");
    expect(deliverToRoom).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "thread-parent" })
    );
  });

  it("notify reports a paused room instead of waking anyone", async () => {
    (deliverToRoom as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      code: "room_paused",
      message: "paused",
      ok: false,
    });
    const tool = createMessageAgentTool(
      deps({ parentAgentId: "chief-of-staff" })
    );
    const result = await runInResolvedSpace(new Set(["sales.researcher"]), () =>
      tool.execute!(
        { agent_id: "sales.researcher", message: "go", mode: "notify" },
        {} as never
      )
    );
    expect(result).toMatchObject({ code: "room_paused", ok: false });
  });

  it("notify needs a Space to have a room", async () => {
    const tool = createMessageAgentTool(deps());
    const result = (await tool.execute!(
      { agent_id: "sales.researcher", message: "brief", mode: "notify" },
      {} as never
    )) as { code: string; ok: boolean };
    expect(result).toMatchObject({ code: "no_room", ok: false });
    expect(deliverToRoom).not.toHaveBeenCalled();
  });

  describe("agent_ids", () => {
    const registry = {
      getAgentConfig: vi.fn(async (id: string) => ({
        id,
        name: id === "chief-of-staff" ? "Chief of Staff" : id.toUpperCase(),
      })),
    } as unknown as DelegationToolDeps["registry"];
    const mounted = new Set(["tim", "tom", "eve"]);

    function roomStore(input: {
      delegated?: boolean;
      members: string[];
      /** The current thread was opened as a room. */
      room?: boolean;
      thread?: boolean;
    }) {
      const added: string[] = [];
      return {
        added,
        store: {
          addAgentMember: vi.fn(async ({ agentId }: { agentId: string }) => {
            added.push(agentId);
          }),
          appendMessage: vi.fn(async () => ({ message: {} })),
          createThread: vi.fn(async (thread: Record<string, unknown>) => ({
            thread: {
              ...thread,
              agent_id: thread.agentId,
              created_by_user_id: thread.createdByUserId,
              id: "room-new",
              route_context: {},
            },
          })),
          getThread: vi.fn(async () =>
            input.thread === false
              ? null
              : {
                  agent_id: "chief-of-staff",
                  created_by_user_id: "user-1",
                  id: "thread-parent",
                  metadata: {},
                  route_context: {
                    ...(input.room ? { room: true } : {}),
                    ...(input.delegated ? { delegated: true } : {}),
                  },
                  title: "Desk",
                }
          ),
          listAgentMembers: vi.fn(async () =>
            input.members.map((agent_id, index) => ({
              agent_id,
              role: index === 0 ? "host" : "member",
            }))
          ),
          mergeThreadMetadataForUser: vi.fn(async () => ({ thread: null })),
        },
      };
    }

    it("opens a room hosted by the sender from a desk and posts to everyone listed", async () => {
      const { added, store } = roomStore({ members: ["chief-of-staff"] });
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: store as never,
        })
      );
      const result = (await runInResolvedSpace(mounted, () =>
        tool.execute!(
          {
            agent_ids: ["tim", "tom"],
            message: "Let's play. Tim starts.",
            mode: "notify",
            purpose: "Win at tic-tac-toe.",
          },
          {} as never
        )
      )) as Record<string, unknown>;
      expect(result).toMatchObject({
        agent_id: "chief-of-staff",
        child_thread_id: "room-new",
        mode: "room",
        ok: true,
        opened: true,
        purpose: "Win at tic-tac-toe.",
        room_host_agent_id: "chief-of-staff",
        room_thread_id: "room-new",
        title: "Chief of Staff & TIM & TOM",
      });
      expect(result.members).toEqual([
        expect.objectContaining({ agent_id: "tim", name: "TIM" }),
        expect.objectContaining({ agent_id: "tom", name: "TOM" }),
      ]);
      expect(store.createThread).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: "chief-of-staff",
          createdByUserId: "user-1",
          metadata: expect.objectContaining({
            room_purpose: "Win at tic-tac-toe.",
          }),
          routeContext: { room: true },
          spaceId: "space-1",
          visibility: "private",
        })
      );
      expect(added).toEqual(["tim", "tom"]);
      expect(deliverToRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          from: { agentId: "chief-of-staff", name: "Chief of Staff" },
          mentions: ["tim", "tom"],
          roomId: "room-new",
          text: "Let's play. Tim starts.",
        })
      );
      expect(runDelegatedSpecialist).not.toHaveBeenCalled();
    });

    it("inside a group room adds the missing members and posts there", async () => {
      const { added, store } = roomStore({
        members: ["chief-of-staff", "tim"],
        room: true,
      });
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: store as never,
        })
      );
      const result = (await runInResolvedSpace(mounted, () =>
        tool.execute!(
          { agent_ids: ["tim", "tom"], message: "Tom joins.", mode: "notify" },
          {} as never
        )
      )) as Record<string, unknown>;
      expect(result).toMatchObject({
        child_thread_id: "thread-parent",
        ok: true,
        opened: false,
      });
      expect(store.createThread).not.toHaveBeenCalled();
      expect(added).toEqual(["tom"]);
      expect(deliverToRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          mentions: ["tim", "tom"],
          roomId: "thread-parent",
        })
      );
    });

    it("a desk with several agents in it is still not a room: a room opens", async () => {
      const { store } = roomStore({ members: ["chief-of-staff", "tim"] });
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: store as never,
        })
      );
      const result = (await runInResolvedSpace(mounted, () =>
        tool.execute!(
          {
            agent_ids: ["tim"],
            message: "hi",
            mode: "notify",
            visibility: "space",
          },
          {} as never
        )
      )) as Record<string, unknown>;
      expect(result).toMatchObject({ ok: true, opened: true });
      expect(store.createThread).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: "space" })
      );
    });

    it("a pair room never grows: a new room opens instead", async () => {
      const { store } = roomStore({
        delegated: true,
        members: ["chief-of-staff", "tim"],
      });
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: store as never,
        })
      );
      const result = (await runInResolvedSpace(mounted, () =>
        tool.execute!(
          { agent_ids: ["tim", "tom"], message: "hi", mode: "notify" },
          {} as never
        )
      )) as Record<string, unknown>;
      expect(result).toMatchObject({ ok: true, opened: true });
      expect(store.createThread).toHaveBeenCalled();
    });

    it("refuses when the room would exceed the cap", async () => {
      const { store } = roomStore({
        members: ["chief-of-staff", "a", "b", "c", "d"],
        room: true,
      });
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: new Set(["a", "b", "c", "d", "tim", "tom"]),
          parentAgentId: "chief-of-staff",
          registry,
          store: store as never,
        })
      );
      const result = await runInResolvedSpace(
        new Set(["a", "b", "c", "d", "tim", "tom"]),
        () =>
          tool.execute!(
            { agent_ids: ["tim", "tom"], message: "hi", mode: "notify" },
            {} as never
          )
      );
      expect(result).toMatchObject({ code: "room_full", ok: false });
      expect(deliverToRoom).not.toHaveBeenCalled();
    });

    it("mode is ignored with agent_ids: even ask posts to the room", async () => {
      const { store } = roomStore({
        members: ["chief-of-staff", "tim"],
        room: true,
      });
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: store as never,
        })
      );
      const result = await runInResolvedSpace(mounted, () =>
        tool.execute!(
          {
            agent_ids: ["tim", "tom"],
            message: "hi",
            mode: "ask",
            purpose: "Play.",
          },
          {} as never
        )
      );
      expect(result).toMatchObject({ mode: "room", ok: true, opened: false });
      expect(runDelegatedSpecialist).not.toHaveBeenCalled();
      // A purpose offered for a room without one is written.
      expect(store.mergeThreadMetadataForUser).toHaveBeenCalledWith(
        expect.objectContaining({ patch: { room_purpose: "Play." } })
      );
    });

    it("a run with no person behind it opens no room", async () => {
      const { store } = roomStore({ members: ["chief-of-staff"] });
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          scope: {
            credential: { kind: "service" as const, token: "svc" },
            isSuperAdmin: false,
            isTenantAdmin: true,
            tenantId: "tenant-1",
            tenantRole: "admin",
            userId: "00000000-0000-0000-0000-000000000000",
          },
          store: store as never,
        })
      );
      const result = await runInResolvedSpace(mounted, () =>
        tool.execute!(
          { agent_ids: ["tim", "tom"], message: "hi", mode: "notify" },
          {} as never
        )
      );
      expect(result).toMatchObject({ code: "no_person", ok: false });
      expect(store.createThread).not.toHaveBeenCalled();
    });

    it("every id must be mounted, and never the sender", async () => {
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
        })
      );
      expect(
        await runInResolvedSpace(mounted, () =>
          tool.execute!(
            { agent_ids: ["tim", "stranger"], message: "hi", mode: "notify" },
            {} as never
          )
        )
      ).toMatchObject({ code: "not_mounted", ok: false });
      expect(
        await runInResolvedSpace(mounted, () =>
          tool.execute!(
            {
              agent_ids: ["tim", "chief-of-staff"],
              message: "hi",
              mode: "notify",
            },
            {} as never
          )
        )
      ).toMatchObject({ code: "cannot_message_self", ok: false });
    });

    it("the schema takes exactly one of agent_id and agent_ids", () => {
      expect(
        messageAgentInputSchema.safeParse({ message: "m", mode: "notify" })
          .success
      ).toBe(false);
      expect(
        messageAgentInputSchema.safeParse({
          agent_id: "a",
          agent_ids: ["a", "b"],
          message: "m",
        }).success
      ).toBe(false);
      expect(
        messageAgentInputSchema.safeParse({ agent_ids: [], message: "m" })
          .success
      ).toBe(false);
      expect(
        messageAgentInputSchema.safeParse({
          agent_ids: ["a", "b"],
          message: "m",
          purpose: "p",
        }).success
      ).toBe(true);
    });
  });

  describe("room_id", () => {
    const registry = {
      getAgentConfig: vi.fn(async (id: string) => ({
        id,
        name: id === "chief-of-staff" ? "Chief of Staff" : id.toUpperCase(),
      })),
    } as unknown as DelegationToolDeps["registry"];
    const mounted = new Set(["tim", "tom"]);

    function namedRoomStore(
      room: Record<string, unknown> | null,
      members: string[] = ["tim", "tom"]
    ) {
      return {
        addAgentMember: vi.fn(async () => undefined),
        appendMessage: vi.fn(async () => ({ message: {} })),
        createThread: vi.fn(async () => undefined),
        getThread: vi.fn(async ({ threadId }: { threadId: string }) =>
          threadId === "room-1" ? room : null
        ),
        listAgentMembers: vi.fn(async () =>
          members.map((agent_id) => ({ agent_id, role: "member" }))
        ),
      } as never;
    }

    const gamingRoom = {
      agent_id: "chief-of-staff",
      created_by_user_id: "user-1",
      id: "room-1",
      metadata: { room_purpose: "Play." },
      route_context: { room: true },
      space_id: "space-1",
      title: "Gaming Room",
      visibility: "private",
    };

    it("posts in the named room and wakes everyone in it", async () => {
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: namedRoomStore(gamingRoom),
        })
      );
      const result = (await runInResolvedSpace(mounted, () =>
        tool.execute!(
          { message: "Where are you playing?", room_id: "room-1" },
          {} as never
        )
      )) as Record<string, unknown>;
      expect(result).toMatchObject({
        child_thread_id: "room-1",
        mode: "room",
        ok: true,
        opened: false,
        room_thread_id: "room-1",
        title: "Gaming Room",
      });
      expect(deliverToRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          from: { agentId: "chief-of-staff", name: "Chief of Staff" },
          mentions: ["tim", "tom"],
          roomId: "room-1",
          text: "Where are you playing?",
        })
      );
      expect(result.members).toEqual([
        expect.objectContaining({ agent_id: "tim" }),
        expect.objectContaining({ agent_id: "tom" }),
      ]);
    });

    it("agent_ids narrows who takes a turn in that room", async () => {
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: namedRoomStore(gamingRoom),
        })
      );
      await runInResolvedSpace(mounted, () =>
        tool.execute!(
          { agent_ids: ["tim"], message: "your move", room_id: "room-1" },
          {} as never
        )
      );
      expect(deliverToRoom).toHaveBeenCalledWith(
        expect.objectContaining({ mentions: ["tim"], roomId: "room-1" })
      );
    });

    it("refuses a thread that is not a room of this Space", async () => {
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: namedRoomStore({
            ...gamingRoom,
            route_context: { delegated: true, room: true },
          }),
        })
      );
      const result = await runInResolvedSpace(mounted, () =>
        tool.execute!({ message: "hi", room_id: "room-1" }, {} as never)
      );
      expect(result).toMatchObject({ code: "no_room", ok: false });
      expect(deliverToRoom).not.toHaveBeenCalled();
    });

    it("refuses a room of another Space", async () => {
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: namedRoomStore({ ...gamingRoom, space_id: "space-2" }),
        })
      );
      const result = await runInResolvedSpace(mounted, () =>
        tool.execute!({ message: "hi", room_id: "room-1" }, {} as never)
      );
      expect(result).toMatchObject({ code: "no_room", ok: false });
      expect(deliverToRoom).not.toHaveBeenCalled();
    });

    it("a room holding only the sender has nobody to address", async () => {
      const tool = createMessageAgentTool(
        deps({
          mountedAgentIds: mounted,
          parentAgentId: "chief-of-staff",
          registry,
          store: namedRoomStore(gamingRoom, ["chief-of-staff"]),
        })
      );
      const result = await runInResolvedSpace(mounted, () =>
        tool.execute!({ message: "hi", room_id: "room-1" }, {} as never)
      );
      expect(result).toMatchObject({ code: "no_addressee", ok: false });
    });

    it("the schema refuses agent_id together with room_id", () => {
      expect(
        messageAgentInputSchema.safeParse({
          agent_id: "tim",
          message: "m",
          room_id: "room-1",
        }).success
      ).toBe(false);
      expect(
        messageAgentInputSchema.safeParse({ message: "m", room_id: "room-1" })
          .success
      ).toBe(true);
    });
  });

  it("the schema defaults to ask", () => {
    expect(
      messageAgentInputSchema.parse({
        agent_id: "a",
        mode: "ask",
        message: "m",
      }).mode
    ).toBe("ask");
  });
});
