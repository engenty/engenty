import { describe, expect, it } from "vitest";
import { assertTaskOwner, createMemoryMcpTaskStore } from "./tasks.js";

describe("MCP task handles", () => {
  it("binds ownership and refuses other clients", async () => {
    const store = createMemoryMcpTaskStore();
    const task = await store.create({
      clientId: "cursor",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      id: "tsk_1",
      inputHash: "abc",
      operationId: "contacts_list",
      status: "working",
      tenantId: "tenant-1",
      updatedAt: new Date().toISOString(),
      userId: "user-1",
    });
    expect(
      assertTaskOwner(task, {
        clientId: "cursor",
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).toBe(true);
    expect(
      assertTaskOwner(task, {
        clientId: "other",
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).toBe(false);
    const cancelled = await store.cancel(task.id);
    expect(cancelled?.status).toBe("cancelled");
  });
});
