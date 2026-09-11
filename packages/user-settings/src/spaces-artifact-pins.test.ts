import { describe, expect, it } from "vitest";
import {
  artifactPinsForSpace,
  emptySpacesArtifactPinsDocument,
  isSpaceArtifactPinned,
  parseSpacesArtifactPinsDocument,
  pinnedArtifactsInOrder,
  pinSpaceArtifact,
  pruneSpaceArtifactPins,
  unpinSpaceArtifact,
} from "./spaces-artifact-pins.js";

const SPACE = "space-1";

describe("spaces artifact pins", () => {
  it("degrades an unreadable doc to null rather than throwing", () => {
    expect(parseSpacesArtifactPinsDocument({ v: 2 })).toBeNull();
    expect(parseSpacesArtifactPinsDocument("nope")).toBeNull();
    expect(parseSpacesArtifactPinsDocument(null)).toBeNull();
  });

  it("parses a v1 document", () => {
    const parsed = parseSpacesArtifactPinsDocument({
      spaces: { [SPACE]: { pinned: ["a1", "a2"] } },
      v: 1,
    });
    expect(parsed?.spaces[SPACE]?.pinned).toEqual(["a1", "a2"]);
  });

  it("pins to the end and unpins without touching another space", () => {
    let doc = emptySpacesArtifactPinsDocument();
    doc = pinSpaceArtifact(doc, SPACE, "a1");
    doc = pinSpaceArtifact(doc, SPACE, "a2");
    doc = pinSpaceArtifact(doc, "space-2", "b1");
    expect(artifactPinsForSpace(doc, SPACE)).toEqual(["a1", "a2"]);
    expect(isSpaceArtifactPinned(doc, SPACE, "a1")).toBe(true);
    doc = unpinSpaceArtifact(doc, SPACE, "a1");
    expect(artifactPinsForSpace(doc, SPACE)).toEqual(["a2"]);
    expect(artifactPinsForSpace(doc, "space-2")).toEqual(["b1"]);
  });

  it("pinning twice is a no-op", () => {
    let doc = emptySpacesArtifactPinsDocument();
    doc = pinSpaceArtifact(doc, SPACE, "a1");
    expect(pinSpaceArtifact(doc, SPACE, "a1")).toBe(doc);
    expect(unpinSpaceArtifact(doc, SPACE, "missing")).toBe(doc);
  });

  it("drops ids that left the space", () => {
    let doc = emptySpacesArtifactPinsDocument();
    doc = pinSpaceArtifact(doc, SPACE, "keep");
    doc = pinSpaceArtifact(doc, SPACE, "gone");
    doc = pruneSpaceArtifactPins(doc, SPACE, ["keep"]);
    expect(artifactPinsForSpace(doc, SPACE)).toEqual(["keep"]);
  });

  it("orders known artifacts the way they were pinned", () => {
    const rows = [
      { id: "c", title: "C" },
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    expect(
      pinnedArtifactsInOrder(rows, ["b", "missing", "a"]).map((row) => row.id)
    ).toEqual(["b", "a"]);
  });
});
