import { describe, expect, it } from "vitest";
import {
  groupSkillDetailFiles,
  listSkillDetailFiles,
  normalizeSkillFilePath,
} from "./skill-detail-file-entries.js";

describe("normalizeSkillFilePath", () => {
  it("strips leading slashes from nested paths", () => {
    expect(normalizeSkillFilePath("/rules/display-captions.md")).toBe(
      "rules/display-captions.md"
    );
  });
});

describe("listSkillDetailFiles", () => {
  it("returns unique sorted file entries and always includes SKILL.md", () => {
    expect(
      listSkillDetailFiles([
        { logical_path: "/rules/b.md" },
        { logical_path: "rules/a.md" },
        { logical_path: "rules/a.md" },
      ])
    ).toEqual([
      { path: "SKILL.md", label: "SKILL.md" },
      { path: "rules/a.md", label: "a.md" },
      { path: "rules/b.md", label: "b.md" },
    ]);
  });
});

describe("groupSkillDetailFiles", () => {
  it("groups nested files under their folder", () => {
    expect(
      groupSkillDetailFiles([
        { path: "SKILL.md", label: "SKILL.md" },
        { path: "rules/3d.md", label: "3d.md" },
        { path: "rules/audio.md", label: "audio.md" },
      ])
    ).toEqual([
      { folder: null, files: [{ path: "SKILL.md", label: "SKILL.md" }] },
      {
        folder: "rules",
        files: [
          { path: "rules/3d.md", label: "3d.md" },
          { path: "rules/audio.md", label: "audio.md" },
        ],
      },
    ]);
  });
});
