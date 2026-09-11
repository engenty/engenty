import { FileCode2, FileText, Folder, FolderSync, Table2 } from "lucide-react";
import { describe, expect, it } from "vitest";
import { driveNodeIcon } from "./drive-kind-icon";

describe("driveNodeIcon", () => {
  it("uses the page icon for markdown artifacts", () => {
    expect(driveNodeIcon({ kind: "artifact", nodeType: "markdown" })).toBe(
      FileText
    );
    expect(driveNodeIcon({ kind: "artifact", nodeType: "page" })).toBe(
      FileText
    );
    expect(driveNodeIcon({ kind: "artifact" })).toBe(FileText);
  });

  it("picks a distinct icon per artifact format", () => {
    expect(driveNodeIcon({ kind: "artifact", nodeType: "html" })).toBe(
      FileCode2
    );
    expect(driveNodeIcon({ kind: "artifact", nodeType: "table" })).toBe(Table2);
  });

  it("keeps folders as folders", () => {
    expect(driveNodeIcon({ kind: "folder", nodeType: "folder" })).toBe(Folder);
  });

  it("uses a connected-folder icon for mounts", () => {
    expect(driveNodeIcon({ kind: "mount" })).toBe(FolderSync);
    expect(driveNodeIcon({ kind: "folder", nodeType: "files.mount" })).toBe(
      FolderSync
    );
  });

  it("uses the file icon for files-module records", () => {
    expect(driveNodeIcon({ kind: "record", nodeType: "files.file" })).toBe(
      FileText
    );
  });
});
