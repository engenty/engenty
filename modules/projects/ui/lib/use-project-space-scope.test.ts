import { describe, expect, it } from "vitest";
import { projectKeys } from "../queries.js";
import { withProjectSpaceScope } from "./use-project-space-scope.js";

describe("withProjectSpaceScope", () => {
  it("injects the current Space when the caller omitted space_id", () => {
    expect(withProjectSpaceScope({ page: 1 }, "space-acme")).toEqual({
      page: 1,
      space_id: "space-acme",
    });
  });

  it("lets an explicit space_id win", () => {
    expect(
      withProjectSpaceScope({ space_id: "space-other" }, "space-acme")
    ).toEqual({ space_id: "space-other" });
  });

  it("does not invent a filter when there is no current Space", () => {
    expect(withProjectSpaceScope({ page: 1 }, undefined)).toEqual({ page: 1 });
  });

  it("treats an explicit null space_id as already decided", () => {
    expect(withProjectSpaceScope({ space_id: null }, "space-acme")).toEqual({
      space_id: null,
    });
  });
});

describe("project query keys", () => {
  it("include space_id so Space-scoped lists do not share a tenant cache", () => {
    expect(projectKeys.list({ space_id: "space-acme" })).toEqual([
      "projects",
      "list",
      { space_id: "space-acme" },
    ]);
    expect(projectKeys.taskCounts({ space_id: "space-acme" })).toEqual([
      "projects",
      "tasks",
      "counts",
      { space_id: "space-acme" },
    ]);
  });
});
