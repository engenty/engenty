import { describe, expect, it, vi } from "vitest";
import { detachTimesheetRowsForTaskDelete } from "./detach-timesheet-rows-for-task-delete.js";

function makeRowsClient(options: {
  deleteError?: { code?: string; message: string } | null;
  updateError?: { code?: string; message: string } | null;
}) {
  const updateEq = vi.fn();
  const deleteEq = vi.fn();
  const updateChain = Object.assign(
    Promise.resolve({ error: options.updateError ?? null }),
    { eq: updateEq }
  );
  const deleteChain = Object.assign(
    Promise.resolve({ error: options.deleteError ?? null }),
    { eq: deleteEq }
  );
  updateEq.mockImplementation(() => updateChain);
  deleteEq.mockImplementation(() => deleteChain);

  const update = vi.fn(() => updateChain);
  const del = vi.fn(() => deleteChain);
  const from = vi.fn(() => ({
    delete: del,
    update,
  }));
  const schema = vi.fn(() => ({ from }));

  return { deleteEq, from, schema, update, updateEq };
}

describe("detachTimesheetRowsForTaskDelete", () => {
  it("stamps the task title onto timesheet_rows and nulls task_id", async () => {
    const client = makeRowsClient({});
    await detachTimesheetRowsForTaskDelete(client as never, {
      tenantId: "tenant-1",
      scopeId: "scope-1",
      taskId: "task-1",
      taskTitle: "  Mapping-Konzept  ",
    });

    expect(client.schema).toHaveBeenCalledWith("module_time_tracking");
    expect(client.from).toHaveBeenCalledWith("timesheet_rows");
    expect(client.update).toHaveBeenCalledWith({
      task_id: null,
      manual_task_title: "Mapping-Konzept",
    });
    expect(client.updateEq).toHaveBeenCalledWith("task_id", "task-1");
    expect(client.updateEq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(client.updateEq).toHaveBeenCalledWith("scope_id", "scope-1");
    expect(client.deleteEq).not.toHaveBeenCalled();
  });

  it("falls back to deleting task-linked rows on unique-index collision", async () => {
    const client = makeRowsClient({
      updateError: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "idx_module_time_tracking_unique_row"',
      },
    });

    await detachTimesheetRowsForTaskDelete(client as never, {
      tenantId: "tenant-1",
      scopeId: "scope-1",
      taskId: "task-1",
      taskTitle: "Backend-API",
    });

    expect(client.deleteEq).toHaveBeenCalledWith("task_id", "task-1");
  });

  it("throws on unrelated detach errors", async () => {
    const client = makeRowsClient({
      updateError: { message: "permission denied" },
    });

    await expect(
      detachTimesheetRowsForTaskDelete(client as never, {
        tenantId: "tenant-1",
        scopeId: "scope-1",
        taskId: "task-1",
        taskTitle: "Backend-API",
      })
    ).rejects.toThrow("Failed to detach time-tracking rows for task");
  });
});
