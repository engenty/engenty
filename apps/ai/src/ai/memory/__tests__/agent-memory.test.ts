import { describe, expect, it } from "vitest";
import {
  AGENT_MEMORY_MAX_CHARS,
  AGENT_MEMORY_STATE_ID,
  AgentMemoryTooLargeError,
  agentMemoryResourceId,
  appendAgentMemoryNote,
  createAgentMemory,
  forgetAgentMemoryLines,
  MEMORY_FORGET_TOOL_ID,
  MEMORY_NOTE_TOOL_ID,
  readAgentMemory,
  writeAgentMemory,
} from "../agent-memory.js";

function memoryStore(initial = "") {
  const rows = new Map<string, string>();
  if (initial) {
    rows.set("r", initial);
  }
  return {
    rows,
    store: {
      getResourceById: async ({ resourceId }: { resourceId: string }) => {
        const workingMemory = rows.get(resourceId);
        return workingMemory === undefined
          ? null
          : ({
              createdAt: new Date(),
              id: resourceId,
              updatedAt: new Date(),
              workingMemory,
            } as never);
      },
      updateResource: async ({
        resourceId,
        workingMemory,
      }: {
        resourceId: string;
        workingMemory?: string;
      }) => {
        rows.set(resourceId, workingMemory ?? "");
        return {
          createdAt: new Date(),
          id: resourceId,
          updatedAt: new Date(),
          workingMemory,
        } as never;
      },
    },
  };
}

const SPACE_IDENTITY = {
  agentId: "chief-of-staff",
  sharedObservations: "space" as const,
  spaceId: "space-1",
  tenantId: "t1",
  userId: "u1",
};

describe("agent memory (MEMORY.md)", () => {
  it("keys on the shared-observation audience", () => {
    expect(agentMemoryResourceId(SPACE_IDENTITY)).toBe(
      "tenant:t1:agent:chief-of-staff:space:space-1"
    );
    expect(
      agentMemoryResourceId({
        ...SPACE_IDENTITY,
        sharedObservations: "personal",
      })
    ).toBe("tenant:t1:agent:chief-of-staff:user:u1");
    expect(
      agentMemoryResourceId({
        ...SPACE_IDENTITY,
        sharedObservations: "disabled",
      })
    ).toBeNull();
  });

  it("appends dated, single-line notes after the existing ones", () => {
    const first = appendAgentMemoryNote(
      "",
      "Client  prefers\nGerman",
      new Date("2026-09-03T10:00:00Z")
    );
    expect(first).toBe("- 2026-09-03: Client prefers German");
    const second = appendAgentMemoryNote(
      first,
      "Invoices go out on the 1st",
      new Date("2026-09-04T10:00:00Z")
    );
    expect(second.split("\n")).toEqual([
      "- 2026-09-03: Client prefers German",
      "- 2026-09-04: Invoices go out on the 1st",
    ]);
  });

  it("forgets every line containing the text, case-insensitively", () => {
    const memory = [
      "- 2026-08-01: Old kickoff notes",
      "- 2026-09-03: Client prefers German",
      "- 2026-09-04: Invoices go out on the 1st",
    ].join("\n");
    expect(forgetAgentMemoryLines(memory, "2026-08")).toEqual({
      memory: [
        "- 2026-09-03: Client prefers German",
        "- 2026-09-04: Invoices go out on the 1st",
      ].join("\n"),
      removed: 1,
    });
    expect(forgetAgentMemoryLines(memory, "GERMAN").removed).toBe(1);
    expect(forgetAgentMemoryLines(memory, "   ").removed).toBe(0);
  });

  it("refuses a write over the cap and clears on empty", async () => {
    const { store, rows } = memoryStore("- 2026-09-03: keep");
    await expect(
      writeAgentMemory(store, "r", "x".repeat(AGENT_MEMORY_MAX_CHARS + 1))
    ).rejects.toBeInstanceOf(AgentMemoryTooLargeError);
    expect(rows.get("r")).toBe("- 2026-09-03: keep");
    await writeAgentMemory(store, "r", "");
    expect(rows.get("r")).toBe("");
    expect(await readAgentMemory(store, "r")).toBe("");
  });

  it("tools note and forget on the audience row; a full file refuses the note", async () => {
    const { store, rows } = memoryStore();
    const created = createAgentMemory({ identity: SPACE_IDENTITY, store });
    expect(created).not.toBeNull();
    const tools = created!.tools;
    const resourceId = "tenant:t1:agent:chief-of-staff:space:space-1";

    const noted = await tools[MEMORY_NOTE_TOOL_ID].execute!(
      { note: "Client prefers German" } as never,
      {} as never
    );
    expect(noted).toMatchObject({ kept: true });
    expect(rows.get(resourceId)).toMatch(
      /^- \d{4}-\d{2}-\d{2}: Client prefers German$/
    );

    rows.set(
      resourceId,
      `- 2026-01-01: ${"x".repeat(AGENT_MEMORY_MAX_CHARS - 20)}`
    );
    const refused = await tools[MEMORY_NOTE_TOOL_ID].execute!(
      { note: "one more" } as never,
      {} as never
    );
    expect(refused).toMatchObject({ kept: false });
    expect((refused as { reason?: string }).reason).toContain(
      MEMORY_FORGET_TOOL_ID
    );

    const forgotten = await tools[MEMORY_FORGET_TOOL_ID].execute!(
      { contains: "2026-01" } as never,
      {} as never
    );
    expect(forgotten).toEqual({ characters: 0, removed: 1 });
    expect(rows.get(resourceId)).toBe("");
  });

  it("delivers the file as a snapshot signal, nothing when empty", async () => {
    const { store, rows } = memoryStore();
    const created = createAgentMemory({ identity: SPACE_IDENTITY, store })!;
    const empty = await created.processor.computeStateSignal!({} as never);
    expect(empty).toBeUndefined();
    rows.set(
      "tenant:t1:agent:chief-of-staff:space:space-1",
      "- 2026-09-03: keep"
    );
    const signal = await created.processor.computeStateSignal!({} as never);
    expect(signal).toMatchObject({
      id: AGENT_MEMORY_STATE_ID,
      mode: "snapshot",
    });
    expect((signal as { contents: string }).contents).toContain(
      "- 2026-09-03: keep"
    );
  });

  it("is absent for agents without an audience", () => {
    const { store } = memoryStore();
    expect(
      createAgentMemory({
        identity: { ...SPACE_IDENTITY, sharedObservations: "disabled" },
        store,
      })
    ).toBeNull();
  });
});
