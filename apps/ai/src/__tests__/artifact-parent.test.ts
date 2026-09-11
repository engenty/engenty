import { describe, expect, it } from "vitest";
import {
  ArtifactInvalidParentError,
  assertArtifactParentAllowed,
  parentWouldCycle,
} from "../dal/artifacts/artifact-parent.js";

describe("parentWouldCycle", () => {
  it("allows the Artifacts root", () => {
    expect(parentWouldCycle("a", null, () => null)).toBe(false);
  });

  it("rejects a parent that is the artifact itself", () => {
    expect(parentWouldCycle("a", "a", () => null)).toBe(true);
  });

  it("rejects a parent that sits under the moving folder", () => {
    const parentOf: Record<string, string | null> = {
      child: "a",
      grandchild: "child",
    };
    expect(
      parentWouldCycle("a", "grandchild", (id) => parentOf[id] ?? null)
    ).toBe(true);
  });

  it("allows a sibling folder", () => {
    const parentOf: Record<string, string | null> = {
      a: null,
      other: null,
    };
    expect(parentWouldCycle("a", "other", (id) => parentOf[id] ?? null)).toBe(
      false
    );
  });
});

describe("assertArtifactParentAllowed", () => {
  const page = {
    id: "page-1",
    scope_id: "space-1",
    scope_type: "space",
  };

  it("allows clearing the parent", () => {
    expect(() =>
      assertArtifactParentAllowed({
        artifact: page,
        parent: null,
        parentId: null,
        parentOf: () => null,
      })
    ).not.toThrow();
  });

  it("rejects a missing parent row", () => {
    expect(() =>
      assertArtifactParentAllowed({
        artifact: page,
        parent: null,
        parentId: "missing",
        parentOf: () => null,
      })
    ).toThrow(ArtifactInvalidParentError);
  });

  it("rejects a markdown page as parent", () => {
    expect(() =>
      assertArtifactParentAllowed({
        artifact: page,
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
