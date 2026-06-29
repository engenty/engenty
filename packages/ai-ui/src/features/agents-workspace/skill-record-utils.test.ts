import { describe, expect, it } from "vitest";
import { buildSkillRepoRelativePath } from "./skill-record-utils";

describe("buildSkillRepoRelativePath", () => {
  it("uses modules path for non-core module_id", () => {
    expect(
      buildSkillRepoRelativePath({
        logicalPath: "SKILL.md",
        moduleId: "contacts",
        skillName: "contacts-extract-email",
      })
    ).toBe("modules/contacts/ai/skills/contacts-extract-email/SKILL.md");
  });

  it("uses ai-core seed path for engenty-core", () => {
    expect(
      buildSkillRepoRelativePath({
        logicalPath: "SKILL.md",
        moduleId: "engenty-core",
        skillName: "engenty-safe-automation",
      })
    ).toBe("packages/ai-core/src/skills/seed/engenty-safe-automation/SKILL.md");
  });
});
