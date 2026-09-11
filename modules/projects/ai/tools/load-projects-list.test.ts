import { describe, expect, it, vi } from "vitest";
import { buildLoadProjectsListTool } from "./load-projects-list.js";

describe("buildLoadProjectsListTool", () => {
  it("describes listing in current_space rather than the tenant", () => {
    const tool = buildLoadProjectsListTool(vi.fn());
    expect(tool.description).toContain("current_space");
    expect(tool.description).not.toContain("for the tenant");
  });

  it("never omits space_id in a Space-bound run", async () => {
    const invoke = vi.fn(async () => ({ data: [], total: 0 }));
    const tool = buildLoadProjectsListTool(invoke, {
      action: "projects.list",
      moduleId: "projects",
      scope: { space_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      scopeId: "scope-1",
      tenantId: "tenant-1",
      spaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    } as never);

    await tool.execute!({ search: "launch" } as never);

    expect(invoke).toHaveBeenCalledWith("projects_list", {
      search: "launch",
      space_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });
});
