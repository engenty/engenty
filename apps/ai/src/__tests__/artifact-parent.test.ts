import { describe, expect, it } from "vitest";
import {
  ArtifactInvalidParentError,
  assertArtifactParentAllowed,
  parentWouldCycle,
} from "../dal/artifacts/artifact-parent.js";

describe("parentWouldCycle", () => {
  it("rejects a parent that sits under the moving folder", () => {
    const parentOf: Record<string, string | null> = {
      child: "a",
      grandchild: "child",
    };
    expect(
      parentWouldCycle("a", "grandchild", (id) => parentOf[id] ?? null)
    ).toBe(true);
  });
});

describe("assertArtifactParentAllowed", () => {
  it("rejects a markdown page as parent", () => {
    expect(() =>
      assertArtifactParentAllowed({
        artifact: { id: "page-1", scope_id: "space-1", scope_type: "space" },
        parent: {
          id: "other",
          parent_id: null,
          scope_id: "space-1",
          scope_type: "space",
          type: "markdown",
        },
        parentId: "other",
        parentOf: () => null,
      })
    ).toThrow(ArtifactInvalidParentError);
  });
});
