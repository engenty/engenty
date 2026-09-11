import { describe, expect, it } from "vitest";
import {
  builtinPlatformSkillNames,
  isSkillWorkspaceMount,
  resolveAllowedSkillNames,
  skillNamesByModuleFromCapabilities,
} from "../allowed-skills.js";

const moduleSkills = skillNamesByModuleFromCapabilities([
  {
    moduleId: "projects",
    skills: {
      "projects-management": "# projects",
      "projects-task-management": "# tasks",
    },
  },
  {
    moduleId: "invoices",
    skills: {
      "invoices-search": "# invoices",
    },
  },
  {
    moduleId: "contacts",
  },
]);

describe("skillNamesByModuleFromCapabilities", () => {
  it("reads skill names from the dynamic capability registry, not a hand-written list", () => {
    expect(moduleSkills.get("projects")).toEqual([
      "projects-management",
      "projects-task-management",
    ]);
    expect(moduleSkills.get("invoices")).toEqual(["invoices-search"]);
    expect(moduleSkills.has("contacts")).toBe(false);
  });
});

describe("resolveAllowedSkillNames", () => {
  it("leaves global runs unfiltered", () => {
    expect(
      resolveAllowedSkillNames({
        kind: "global",
        explicitSkillNames: ["pr-review"],
        mountedModuleIds: ["projects"],
        moduleSkills,
        preferredSkillNames: ["changelog"],
      })
    ).toBeUndefined();
  });

  it("hides every skill when the Space is unresolved", () => {
    expect(
      resolveAllowedSkillNames({
        kind: "unresolved",
        explicitSkillNames: ["pr-review"],
        mountedModuleIds: ["projects"],
        moduleSkills,
        preferredSkillNames: ["changelog"],
        platformSkillNames: builtinPlatformSkillNames(),
      })
    ).toEqual([]);
  });

  it("unions explicit mounts, mounted-module skills, preferred skills, and platform skills", () => {
    expect(
      resolveAllowedSkillNames({
        kind: "resolved",
        explicitSkillNames: ["pr-review"],
        mountedModuleIds: ["projects"],
        moduleSkills,
        preferredSkillNames: ["changelog"],
        platformSkillNames: ["find-skills"],
      })
    ).toEqual([
      "changelog",
      "find-skills",
      "pr-review",
      "projects-management",
      "projects-task-management",
    ]);
  });

  it("does not include skills from unmounted modules merely because they exist in the registry", () => {
    const allowed = resolveAllowedSkillNames({
      kind: "resolved",
      mountedModuleIds: ["projects"],
      moduleSkills,
    });
    expect(allowed).toContain("projects-management");
    expect(allowed).not.toContain("invoices-search");
  });
});

describe("isSkillWorkspaceMount", () => {
  it("recognises the tenant skill library mount", () => {
    expect(
      isSkillWorkspaceMount({
        fileStorageRelativePath: "ai/skills/",
        mountPath: "/skills",
        readOnly: true,
      })
    ).toBe(true);
    expect(
      isSkillWorkspaceMount({
        fileStorageRelativePath: "ai/workspace/users/user-1/",
        mountPath: "/home",
      })
    ).toBe(false);
  });
});

describe("builtinPlatformSkillNames", () => {
  it("exposes runtime playbooks, not library or copilot product skills", () => {
    const names = builtinPlatformSkillNames();
    expect(names).toContain("find-skills");
    expect(names).toContain("engenty-skill-authoring");
    expect(names).not.toContain("xlsx");
    expect(names).not.toContain("pptx");
    expect(names).not.toContain("canvas-design");
    expect(names).not.toContain("work-routing");
  });
});
