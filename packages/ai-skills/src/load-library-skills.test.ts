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

  it("carries the Space playbooks the copilot and hired engenties share", () => {
    // Moved off the copilot module: one flat managed catalog, and a hired
    // engenty reaches a playbook by name exactly as the copilot does.
    expect(librarySkillNamesByCategory().spaces).toEqual(
      expect.arrayContaining([
        "chief-of-staff",
        "durable-work",
        "hire-agent",
        "routines",
        "space-data",
        "space-setup",
        "work-routing",
      ])
    );
    const byName = new Map(
      listLibrarySkills().map((skill) => [skill.name, skill.skillMarkdown])
    );
    const router = byName.get("work-routing");
    expect(router).toContain("`message_agent` to a mounted Engenty");
    expect(router).toContain("Load **hire-agent**");
    expect(router).toContain("Load **durable-work**");

    const hire = byName.get("hire-agent");
    expect(hire).toContain("Call `registry_agents_list` in this turn");
    expect(hire).toContain("`for_work`: `routine`");
    expect(hire).toContain("`routines_create`");
    expect(hire).toContain("reusing an existing id make it a gated proposal");

    const durable = byName.get("durable-work");
    expect(durable).toContain("Call `registry_agents_list` in this turn");
    expect(durable).toContain('Default `status: "todo"` IS the kickoff');
    expect(durable).toContain("invent `tasks_dispatch`");
    // An outcome too big for one Task becomes several Tasks with real
    // dependencies; nothing plans on anyone's behalf.
    expect(durable).toContain("blocked_by_task_ids");
    expect(durable).not.toMatch(/goals?_\w+/);
    expect(router).not.toMatch(/goals?_\w+/);

    expect(byName.get("space-data")).toContain("Artifacts");

    // The routine contract, once, where every engenty reads it: prompt XOR
    // Workflow, the promise, the wake sources, and that a person may have
    // the last word.
    const routines = byName.get("routines");
    expect(routines).toContain("`prompt`");
    expect(routines).toContain("`workflow_id`");
    expect(routines).toContain("`outcome`");
    expect(routines).toContain("`ask_first: true`");
    expect(routines).toContain("Europe/Vienna");
    expect(routines).not.toContain("`instructions`");
    expect(hire).not.toContain("never publish it yourself");
    expect(durable).toContain("**routines** skill");
  });
});
