import { describe, expect, it } from "vitest";
import {
  librarySkillNamesByCategory,
  listLibrarySkills,
} from "./load-library-skills.js";

describe("library skills pack", () => {
  it("flattens category folders and requires unique names", () => {
    const skills = listLibrarySkills();
    const names = skills.map((skill) => skill.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "plan",
        "xlsx",
        "grounded-citations",
        "document-to-action-items",
      ])
    );
    expect(names).not.toContain("nano-pdf");
    expect(librarySkillNamesByCategory().productivity).toEqual(
      expect.arrayContaining(["xlsx", "pdf", "docx", "pptx"])
    );
    expect(librarySkillNamesByCategory().design).toEqual(
      expect.arrayContaining(["canvas-design"])
    );
    const canvas = skills.find((skill) => skill.name === "canvas-design");
    expect(canvas?.category).toBe("design");
    expect(canvas?.skillMarkdown).toContain("data:font/ttf;base64");
    expect(canvas?.skillMarkdown).toContain("/skills/managed/canvas-design");
    expect(canvas?.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "LICENSE.txt",
        "references/fonts.md",
        "canvas-fonts/Lora-Regular.ttf",
      ])
    );
    const lora = canvas?.files.find(
      (file) => file.path === "canvas-fonts/Lora-Regular.ttf"
    );
    expect(lora?.contentType).toBe("font/ttf");
    expect(lora?.bytes.byteLength).toBeGreaterThan(1000);
    const pptx = skills.find((skill) => skill.name === "pptx");
    expect(pptx?.skillMarkdown).toContain("origin: original");
    expect(pptx?.skillMarkdown).not.toContain("pptxgenjs");
    expect(pptx?.skillMarkdown).not.toContain("anthropics/skills");
  });

  it("stamps Hermes origin on adapted skills", () => {
    const plan = listLibrarySkills().find((skill) => skill.name === "plan");
    expect(plan?.category).toBe("software-development");
    expect(plan?.skillMarkdown).toMatch(
      /origin:\s*hermes-agent skills\/software-development\/plan/
    );
    expect(plan?.skillMarkdown).toMatch(/license:\s*MIT/);
    expect(plan?.skillMarkdown).toMatch(/author:/);
    expect(plan?.skillMarkdown).not.toContain("skill_view");
    expect(plan?.skillMarkdown).toContain("Never `.hermes/plans/`");
  });
});
