import { describe, expect, it } from "vitest";
import { validateBlockedBy } from "./task-blockers.js";

describe("validateBlockedBy", () => {
  /** Build a loader over an in-memory graph of id → blocked_by ids. */
  function loaderFor(graph: Record<string, string[]>) {
    return {
      loadBlockedBy: async (id: string) =>
        Object.hasOwn(graph, id) ? graph[id] : null,
    };
  }

  it("accepts a diamond (D blocked by B and C, both blocked by A)", async () => {
    const graph = { a: [], b: ["a"], c: ["a"] };
    const result = await validateBlockedBy("d", ["b", "c"], loaderFor(graph));
    expect(result).toEqual(["b", "c"]);
  });

  it("rejects a self-block", async () => {
    await expect(
      validateBlockedBy("x", ["x"], loaderFor({ x: [] }))
    ).rejects.toThrow(/self_reference/);
  });

  it("rejects an unknown blocker id", async () => {
    await expect(
      validateBlockedBy("x", ["ghost"], loaderFor({ a: [] }))
    ).rejects.toThrow(/task_blocker_unknown/);
  });

  it("rejects a direct cycle (blocker is already blocked by taskId)", async () => {
    // b is blocked by x; making x blocked by b closes a 2-cycle.
    const graph = { x: [], b: ["x"] };
    await expect(
      validateBlockedBy("x", ["b"], loaderFor(graph))
    ).rejects.toThrow(/task_blocker_cycle/);
  });

  it("rejects a transitive cycle (x ← b ← c ← x)", async () => {
    const graph = { x: [], b: ["c"], c: ["x"] };
    await expect(
      validateBlockedBy("x", ["b"], loaderFor(graph))
    ).rejects.toThrow(/task_blocker_cycle/);
  });
});
