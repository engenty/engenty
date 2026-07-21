import { describe, expect, it } from "vitest";
import {
  allChildrenTerminal,
  normalizeBlockerIds,
  openBlockerIds,
  validateBlockedBy,
} from "./task-blockers.js";

describe("openBlockerIds", () => {
  it("treats only 'done' as resolved — cancelled stays OPEN", () => {
    const statusById = new Map<string, string | undefined>([
      ["a", "done"],
      ["b", "cancelled"],
      ["c", "in_progress"],
      // "d" unknown → undefined → open
    ]);
    expect(openBlockerIds(["a", "b", "c", "d"], statusById)).toEqual([
      "b",
      "c",
      "d",
    ]);
  });

  it("returns empty when all blockers are done", () => {
    const statusById = new Map([
      ["a", "done"],
      ["b", "done"],
    ]);
    expect(openBlockerIds(["a", "b"], statusById)).toEqual([]);
  });
});

describe("allChildrenTerminal", () => {
  it("is true only when every child is done/cancelled and there is at least one", () => {
    expect(allChildrenTerminal([])).toBe(false);
    expect(allChildrenTerminal(["done", "cancelled"])).toBe(true);
    expect(allChildrenTerminal(["done", "in_review"])).toBe(false);
  });
});

describe("normalizeBlockerIds", () => {
  it("dedupes and trims", () => {
    expect(normalizeBlockerIds([" a ", "a", "b", "", "  "])).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("validateBlockedBy", () => {
  /** Build a loader over an in-memory graph of id → blocked_by ids. */
  function loaderFor(graph: Record<string, string[]>) {
    return {
      loadBlockedBy: async (id: string) =>
        Object.hasOwn(graph, id) ? graph[id] : null,
    };
  }

  it("accepts a set with no cycle and returns it deduped", async () => {
    const graph = { a: [], b: [] };
    const result = await validateBlockedBy(
      "x",
      ["a", "b", "a"],
      loaderFor(graph)
    );
    expect(result).toEqual(["a", "b"]);
  });

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

  it("no-ops on an empty set without touching the loader", async () => {
    let called = false;
    const result = await validateBlockedBy("x", [], {
      loadBlockedBy: async () => {
        called = true;
        return [];
      },
    });
    expect(result).toEqual([]);
    expect(called).toBe(false);
  });
});
