import { describe, expect, it } from "vitest";
import { formatWorkspaceMountNote } from "../workspace-mount-note.js";

describe("formatWorkspaceMountNote", () => {
  it("says nothing when the run has everything a Space run should", () => {
    expect(
      formatWorkspaceMountNote({
        dropped: [{ path: "/task", reason: "no_task" }],
        resolution: { kind: "global" },
      })
    ).toBeNull();
  });

  it("names the Space mounts an unresolved run lost, and the empty /skills", () => {
    const note = formatWorkspaceMountNote({
      dropped: [
        { path: "/data", reason: "no_space" },
        { path: "/space", reason: "no_space" },
        { path: "/task", reason: "no_task" },
      ],
      resolution: {
        kind: "unresolved",
        reason: "not_found",
        spaceId: "space-1",
      } as never,
    });
    expect(note).toContain("/data and /space are not mounted");
    expect(note).toContain("could not be resolved");
    expect(note).toContain("/skills lists no skills");
    expect(note).not.toContain("/task");
    expect(note).toContain("do not report the Space as empty");
  });

  it("explains an empty /skills on its own when no mount was dropped", () => {
    const note = formatWorkspaceMountNote({
      dropped: [],
      resolution: { kind: "unresolved", reason: "forbidden" } as never,
    });
    expect(note).toContain("/skills lists no skills");
    expect(note).not.toContain("not mounted");
  });

  it("uses the global wording for a run that has no Space by design", () => {
    const note = formatWorkspaceMountNote({
      dropped: [{ path: "/data", reason: "no_space" }],
      resolution: { kind: "global" },
    });
    expect(note).toContain("/data is not mounted (this run has no Space)");
  });
});
