import { describe, expect, it } from "vitest";
import {
  getTasksListEnrichers,
  getTasksListRegisteredColumns,
  registerTasksListColumn,
  registerTasksListEnricher,
  resetTasksListHooks,
} from "./list-hooks.js";

describe("tasks list hooks", () => {
  it("registers and resets list columns", () => {
    resetTasksListHooks();

    registerTasksListColumn({
      key: "project",
      label: "Project",
      order: 35,
      renderCell: () => null,
    });

    expect(getTasksListRegisteredColumns().map((column) => column.key)).toEqual(
      ["project"]
    );

    resetTasksListHooks();
    expect(getTasksListRegisteredColumns()).toEqual([]);
  });

  it("registers enrichers by id", () => {
    resetTasksListHooks();

    registerTasksListEnricher({
      id: "projects",
      enrich: async () => ({}),
    });

    expect(getTasksListEnrichers().map((enricher) => enricher.id)).toEqual([
      "projects",
    ]);
  });
});
