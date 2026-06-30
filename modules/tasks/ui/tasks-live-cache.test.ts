import { describe, expect, it } from "vitest";
import { createTaskDetailLiveBindings } from "./tasks-live-cache.js";
import { taskKeys } from "./tasks-queries.js";

describe("createTaskDetailLiveBindings", () => {
  it("maps task tables to detail, runs, and activity query keys", () => {
    const bindings = createTaskDetailLiveBindings("task-1");
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.postgresChanges).toHaveLength(4);
    expect(
      bindings[0]?.resolveQueryKeys(
        { tenantId: "tenant-1" },
        {
          kind: "postgres_changes",
          schema: "module_tasks",
          table: "tasks",
        }
      )
    ).toEqual([
      taskKeys.detail("task-1"),
      taskKeys.runs("task-1"),
      taskKeys.activity("task-1"),
    ]);
  });
});
