import { describe, expect, it } from "vitest";
import { artifactOverflowForType } from "./artifact-overflow-capabilities";

describe("artifactOverflowForType", () => {
  it("opens markdown in the page editor and allows duplicate", () => {
    expect(artifactOverflowForType("markdown")).toMatchObject({
      duplicate: true,
      edit: "page",
      versions: true,
    });
  });

  it("sends html, table, app and database edits to Copilot", () => {
    for (const type of ["html", "table", "app", "database"]) {
      expect(artifactOverflowForType(type).edit).toBe("copilot");
    }
  });

  it("renames folders and skips duplicate and versions", () => {
    expect(artifactOverflowForType("folder")).toMatchObject({
      duplicate: false,
      edit: "rename",
      versions: false,
    });
  });

  it("does not duplicate handle types", () => {
    for (const type of ["app", "file", "database", "folder"]) {
      expect(artifactOverflowForType(type).duplicate).toBe(false);
    }
  });
});
