import { describe, expect, it } from "vitest";
import { listSkillDetailFiles } from "./skill-detail-file-entries.js";

describe("listSkillDetailFiles", () => {
  it("returns unique sorted file entries", () => {
    expect(
      listSkillDetailFiles([
        { logical_path: "b.md" },
        { logical_path: "a.md" },
        { logical_path: "a.md" },
      ])
    ).toEqual([
      { path: "a.md", label: "a.md" },
      { path: "b.md", label: "b.md" },
    ]);
  });
});
