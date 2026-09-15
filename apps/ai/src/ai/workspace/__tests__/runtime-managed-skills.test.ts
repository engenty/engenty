import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  loadRuntimeManagedSkills,
  runtimeManagedSkillNames,
} from "../../../../ai/skills/index.js";

describe("runtime managed skills", () => {
  it("includes platform playbooks moved off the copilot module", () => {
    const names = runtimeManagedSkillNames();
    expect(names).toEqual(
      expect.arrayContaining([
        "artifacts-and-downloads",
        "engenty-assistant-voice",
        "engenty-safe-automation",
        "engenty-skill-authoring",
        "find-skills",
        "inspect-ui-dom",
        "sandbox-code-execution",
        "show-records",
      ])
    );
    expect(names).not.toContain("work-routing");
    expect(names).not.toContain("xlsx");
    expect(names).not.toContain("pptx");
    expect(names).not.toContain("canvas-design");
  });

  it("keeps Files module routes and sandbox mount notes in runtime skills", () => {
    const skills = loadRuntimeManagedSkills();
    expect(skills["artifacts-and-downloads"]).toContain("/admin/files");
    expect(skills["artifacts-and-downloads"]).not.toContain("/mdl/files");
    expect(skills["artifacts-and-downloads"]).toContain("app_build");
    expect(skills["artifacts-and-downloads"]).toContain("app-authoring");
    expect(skills["artifacts-and-downloads"]).toContain("canvas-design");
    expect(skills["artifacts-and-downloads"]).toContain("data:");
    expect(skills["sandbox-code-execution"]).toContain(
      "A Space-confined run can receive `/space` and does not receive `/shared`."
    );
    expect(skills["sandbox-code-execution"]).toContain("/data/Files");
    expect(skills["artifacts-and-downloads"]).toContain("/data/Files");
  });

  it("documents three-root authoring without a prompt index", () => {
    const authoring = readFileSync(
      join(
        fileURLToPath(
          new URL(
            "../../../../ai/skills/engenty-skill-authoring/SKILL.md",
            import.meta.url
          )
        )
      ),
      "utf8"
    );
    expect(authoring).toContain("packages/ai-skills");
    expect(authoring).toContain("skill_search");
    expect(authoring).not.toContain("skills_list");
    expect(authoring).toContain("2–3 realistic user prompts");
    expect(authoring).not.toContain("eval-viewer");
    expect(authoring).not.toContain("evals.json");
  });
});
