import { describe, expect, it } from "vitest";
import { parseFileArtifactHandle } from "./file-artifact-handle.js";

describe("parseFileArtifactHandle", () => {
  it("reads a handle and derives the display name from the key", () => {
    expect(
      parseFileArtifactHandle(
        JSON.stringify({ key: "tenants/t1/ai/workspace/q3.xlsx" })
      )
    ).toEqual({ key: "tenants/t1/ai/workspace/q3.xlsx", name: "q3.xlsx" });
  });

  it("keeps an explicit name and mime type", () => {
    expect(
      parseFileArtifactHandle(
        JSON.stringify({
          key: "tenants/t1/report.bin",
          mime_type: "application/pdf",
          name: "Q3 Report.pdf",
        })
      )
    ).toEqual({
      key: "tenants/t1/report.bin",
      mime_type: "application/pdf",
      name: "Q3 Report.pdf",
    });
  });

  it("returns null for content that is not a usable handle", () => {
    // A renderer must degrade to "no preview", never throw on a bad row: the
    // pane renders whatever the store hands it.
    expect(parseFileArtifactHandle(null)).toBeNull();
    expect(parseFileArtifactHandle("")).toBeNull();
    expect(parseFileArtifactHandle("# not json")).toBeNull();
    expect(parseFileArtifactHandle(JSON.stringify({ name: "x" }))).toBeNull();
    expect(parseFileArtifactHandle(JSON.stringify({ key: "  " }))).toBeNull();
  });
});
