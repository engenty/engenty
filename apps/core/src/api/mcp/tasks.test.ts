import { describe, expect, it } from "vitest";
import { assertTaskOwner, type McpTaskRecord } from "./tasks.js";

describe("MCP task handles", () => {
  it("only the owning client, user and tenant may read a task", () => {
    const task = {
      clientId: "cursor",
      tenantId: "tenant-1",
      userId: "user-1",
    } as McpTaskRecord;
    const owner = {
      clientId: "cursor",
      tenantId: "tenant-1",
      userId: "user-1",
    };

    expect(assertTaskOwner(task, owner)).toBe(true);
    expect(assertTaskOwner(task, { ...owner, clientId: "other" })).toBe(false);
    expect(assertTaskOwner(task, { ...owner, tenantId: "tenant-2" })).toBe(
      false
    );
  });
});
