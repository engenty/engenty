import { describe, expect, it } from "vitest";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import {
  mergeTaskStatusDefinitionsFromPayload,
  normalizeTaskStatusDefinitionsFromStorage,
} from "./task-status-settings.js";

describe("normalizeTaskStatusDefinitionsFromStorage", () => {
  it("preserves JSON object array order", () => {
    const raw = JSON.stringify([
      { id: "done", label: "Done", color: "green" },
      { id: "todo", label: "To do", color: "blue" },
      { id: "in_progress", label: "Working", color: "orange" },
    ]);
    const out = normalizeTaskStatusDefinitionsFromStorage(raw);
    expect(out.map((d) => d.id)).toEqual(["done", "todo", "in_progress"]);
    expect(out.find((d) => d.id === "in_progress")?.label).toBe("Working");
  });

  it("dedupes duplicate ids keeping first occurrence", () => {
    const raw = JSON.stringify([
      { id: "todo", label: "First", color: "blue" },
      { id: "todo", label: "Second", color: "red" },
    ]);
    const out = normalizeTaskStatusDefinitionsFromStorage(raw);
    expect(out.filter((d) => d.id === "todo")).toHaveLength(1);
    expect(out[0]?.label).toBe("First");
  });

  it("appends missing required statuses at the end", () => {
    const raw = JSON.stringify([
      { id: "backlog", label: "Backlog", color: "slate" },
    ]);
    const out = normalizeTaskStatusDefinitionsFromStorage(raw);
    const ids = out.map((d) => d.id);
    expect(ids).toContain("todo");
    expect(ids).toContain("in_progress");
    expect(ids).toContain("done");
    expect(ids.at(-1)).toBe("done");
  });

  it("returns full builtins when the array has no parsable definition rows", () => {
    for (const raw of [
      JSON.stringify(["done", "todo", "in_progress"]),
      JSON.stringify(["not-an-object", 1, null]),
    ]) {
      const out = normalizeTaskStatusDefinitionsFromStorage(raw);
      expect(out.map((d) => d.id)).toEqual(
        BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => d.id)
      );
    }
  });
});

describe("mergeTaskStatusDefinitionsFromPayload", () => {
  it("preserves client row order", () => {
    const merged = mergeTaskStatusDefinitionsFromPayload([
      { id: "blocked", label: "Blocked", color: "red", locked: false },
      { id: "todo", label: "To do", color: "blue", locked: true },
      { id: "done", label: "Done", color: "green", locked: true },
      { id: "in_progress", label: "IP", color: "orange", locked: true },
    ]);
    expect(merged.map((d) => d.id)).toEqual([
      "blocked",
      "todo",
      "done",
      "in_progress",
    ]);
  });
});
