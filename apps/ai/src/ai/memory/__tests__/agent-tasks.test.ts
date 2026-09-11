import { describe, expect, it } from "vitest";
import {
  AGENT_TASKS_MAX_CHARS,
  AGENT_TASKS_METADATA_KEY,
  AGENT_TASKS_STATE_ID,
  AgentTasksTooLargeError,
  agentTasksResourceId,
  applyTodoEdit,
  createAgentTasks,
  parseAgentTasks,
  pruneAgentTasks,
  readAgentTasks,
  renderAgentTasks,
  TODO_EDIT_TOOL_ID,
  writeAgentTasks,
} from "../agent-tasks.js";

function resourceStore(
  initial: { tasks?: string; workingMemory?: string } = {}
) {
  const rows = new Map<
    string,
    { metadata: Record<string, unknown>; workingMemory?: string }
  >();
  if (initial.tasks !== undefined || initial.workingMemory !== undefined) {
    rows.set("r", {
      metadata:
        initial.tasks === undefined
          ? {}
          : { [AGENT_TASKS_METADATA_KEY]: initial.tasks },
      ...(initial.workingMemory === undefined
        ? {}
        : { workingMemory: initial.workingMemory }),
    });
  }
  return {
    rows,
    store: {
      getResourceById: async ({ resourceId }: { resourceId: string }) => {
        const row = rows.get(resourceId);
        return row
          ? ({
              createdAt: new Date(),
              id: resourceId,
              metadata: row.metadata,
              updatedAt: new Date(),
              workingMemory: row.workingMemory,
            } as never)
          : null;
      },
      // Mirrors Mastra pg: metadata merges shallowly, workingMemory only
      // changes when given.
      updateResource: async ({
        metadata,
        resourceId,
        workingMemory,
      }: {
        metadata?: Record<string, unknown>;
        resourceId: string;
        workingMemory?: string;
      }) => {
        const row = rows.get(resourceId) ?? { metadata: {} };
        const next = {
          metadata: { ...row.metadata, ...(metadata ?? {}) },
          workingMemory:
            workingMemory === undefined ? row.workingMemory : workingMemory,
        };
        rows.set(resourceId, next);
        return {
          createdAt: new Date(),
          id: resourceId,
          metadata: next.metadata,
          updatedAt: new Date(),
          workingMemory: next.workingMemory,
        } as never;
      },
    },
  };
}

const NOW = new Date("2026-09-06T10:00:00Z");
const SPACE_IDENTITY = {
  agentId: "chief-of-staff",
  sharedObservations: "space" as const,
  spaceId: "space-1",
  tenantId: "t1",
  userId: "u1",
};

describe("agent tasks (TASKS.md)", () => {
  it("keys on the memory audience (the copilot is a personal agent)", () => {
    expect(agentTasksResourceId(SPACE_IDENTITY)).toBe(
      "tenant:t1:agent:chief-of-staff:space:space-1"
    );
    expect(
      agentTasksResourceId({
        ...SPACE_IDENTITY,
        agentId: "engenty.copilot",
        sharedObservations: "personal",
      })
    ).toBe("tenant:t1:agent:engenty.copilot:user:u1");
    expect(
      agentTasksResourceId({
        ...SPACE_IDENTITY,
        sharedObservations: "disabled",
      })
    ).toBeNull();
  });

  it("parses tolerantly and renders canonically", () => {
    const parsed = parseAgentTasks(
      [
        "# TASKS.md",
        "## Goals",
        "- Keep the SFG account happy",
        "",
        "## Tasks",
        "- [ ] 2026-09-01: send the offer",
        "- [X] 2026-09-05:   call   back ",
        "- [ ] no date here",
        "stray line",
      ].join("\n"),
      NOW
    );
    expect(parsed).toEqual({
      goals: ["Keep the SFG account happy"],
      tasks: [
        { date: "2026-09-01", done: false, text: "send the offer" },
        { date: "2026-09-05", done: true, text: "call back" },
        { date: "2026-09-06", done: false, text: "no date here" },
        { date: "2026-09-06", done: false, text: "stray line" },
      ],
    });
    const rendered = renderAgentTasks(parsed);
    expect(rendered).toBe(
      [
        "## Goals",
        "- Keep the SFG account happy",
        "",
        "## Tasks",
        "- [ ] 2026-09-01: send the offer",
        "- [x] 2026-09-05: call back",
        "- [ ] 2026-09-06: no date here",
        "- [ ] 2026-09-06: stray line",
      ].join("\n")
    );
    expect(parseAgentTasks(rendered, NOW)).toEqual(parsed);
    expect(renderAgentTasks({ goals: [], tasks: [] })).toBe("");
  });

  it("prunes done tasks older than the retention, keeps open ones forever", () => {
    const pruned = pruneAgentTasks(
      {
        goals: [],
        tasks: [
          { date: "2026-08-01", done: false, text: "old but open" },
          { date: "2026-08-29", done: true, text: "done 8 days ago" },
          { date: "2026-08-30", done: true, text: "done 7 days ago" },
          { date: "2026-09-06", done: true, text: "done today" },
        ],
      },
      NOW
    );
    expect(pruned.removed).toBe(1);
    expect(pruned.model.tasks.map((t) => t.text)).toEqual([
      "old but open",
      "done 7 days ago",
      "done today",
    ]);
  });

  it("normalizes a whole line handed to add", () => {
    const result = applyTodoEdit(
      { goals: [], tasks: [] },
      { add: ["- [ ] 2026-09-07: doppelte Kontakte bereinigen", "[x] plain"] },
      NOW
    );
    expect(result.model.tasks).toEqual([
      {
        date: "2026-09-06",
        done: false,
        text: "doppelte Kontakte bereinigen (due 2026-09-07)",
      },
      { date: "2026-09-06", done: false, text: "plain" },
    ]);
  });

  it("applies a batch in drop → done → add → goals order", () => {
    const result = applyTodoEdit(
      {
        goals: ["old goal"],
        tasks: [
          { date: "2026-09-01", done: false, text: "send the offer to SFG" },
          { date: "2026-09-02", done: false, text: "book the room" },
        ],
      },
      {
        add: ["  follow up  with SFG ", ""],
        done: ["offer", "nothing like this"],
        drop: ["room"],
        goals: ["Close SFG this quarter"],
      },
      NOW
    );
    expect(result.matched).toBe(2);
    expect(result.unmatched).toEqual(["nothing like this"]);
    expect(result.model).toEqual({
      goals: ["Close SFG this quarter"],
      tasks: [
        { date: "2026-09-06", done: true, text: "send the offer to SFG" },
        { date: "2026-09-06", done: false, text: "follow up with SFG" },
      ],
    });
  });

  it("writes metadata only and leaves MEMORY.md alone", async () => {
    const { rows, store } = resourceStore({
      workingMemory: "- 2026-09-01: a fact",
    });
    const stored = await writeAgentTasks(store, "r", "- [ ] do it", NOW);
    expect(stored).toBe("## Tasks\n- [ ] 2026-09-06: do it");
    expect(rows.get("r")).toEqual({
      metadata: { [AGENT_TASKS_METADATA_KEY]: stored },
      workingMemory: "- 2026-09-01: a fact",
    });
    expect(await readAgentTasks(store, "r")).toBe(stored);
    await expect(
      writeAgentTasks(
        store,
        "r",
        `- [ ] ${"x".repeat(AGENT_TASKS_MAX_CHARS)}`,
        NOW
      )
    ).rejects.toBeInstanceOf(AgentTasksTooLargeError);
    expect(await writeAgentTasks(store, "r", "", NOW)).toBe("");
  });

  it("binds one todo_edit tool and a processor that prunes at turn start", async () => {
    const { rows, store } = resourceStore({
      tasks: [
        "## Tasks",
        "- [x] 2026-08-01: long done",
        "- [ ] 2026-09-01: still open",
      ].join("\n"),
    });
    const runtime = createAgentTasks({
      identity: SPACE_IDENTITY,
      now: () => NOW,
      store: {
        getResourceById: (input) =>
          store
            .getResourceById({ resourceId: "r" })
            .then((row) =>
              row
                ? ({ ...(row as object), id: input.resourceId } as never)
                : null
            ),
        updateResource: (input) =>
          store.updateResource({ ...input, resourceId: "r" }),
      },
    });
    expect(runtime).not.toBeNull();
    const signal = await runtime!.processor.computeStateSignal!({} as never);
    expect(signal?.id).toBe(AGENT_TASKS_STATE_ID);
    expect(signal?.contents).toContain("- [ ] 2026-09-01: still open");
    expect(signal?.contents).not.toContain("long done");
    expect(rows.get("r")?.metadata[AGENT_TASKS_METADATA_KEY]).toBe(
      "## Tasks\n- [ ] 2026-09-01: still open"
    );

    const tool = runtime!.tools[TODO_EDIT_TOOL_ID];
    const out = (await tool.execute!(
      { add: ["write the report"], done: ["open"] } as never,
      {} as never
    )) as { kept: boolean; tasks: string };
    expect(out.kept).toBe(true);
    expect(out.tasks).toBe(
      [
        "## Tasks",
        "- [x] 2026-09-06: still open",
        "- [ ] 2026-09-06: write the report",
      ].join("\n")
    );

    const refused = (await tool.execute!(
      {
        add: Array.from({ length: 20 }, () => "w".repeat(300)),
      } as never,
      {} as never
    )) as { kept: boolean; reason?: string };
    expect(refused.kept).toBe(false);
    expect(refused.reason).toContain(`${AGENT_TASKS_MAX_CHARS}`);
  });

  it("emits no signal for an empty pad", async () => {
    const { store } = resourceStore();
    const runtime = createAgentTasks({ identity: SPACE_IDENTITY, store });
    expect(
      await runtime!.processor.computeStateSignal!({} as never)
    ).toBeUndefined();
  });
});
