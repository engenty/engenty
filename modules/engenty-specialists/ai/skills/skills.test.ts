import { describe, expect, it } from "vitest";
import { ENGENTY_SPECIALISTS_MANAGED_SKILLS } from "./index.js";

describe("engenty-specialists managed skills", () => {
  it("carries the Space playbooks the copilot and hired engenties share", () => {
    // One flat managed catalog, seeded by name: a hired engenty reaches a
    // playbook exactly as the copilot does.
    expect(Object.keys(ENGENTY_SPECIALISTS_MANAGED_SKILLS).toSorted()).toEqual([
      "chief-of-staff",
      "durable-work",
      "getting-started",
      "hire-agent",
      "routines",
      "space-data",
      "space-setup",
      "work-routing",
    ]);
    for (const [name, markdown] of Object.entries(
      ENGENTY_SPECIALISTS_MANAGED_SKILLS
    )) {
      expect(markdown, name).toMatch(new RegExp(`^---\\nname: ${name}\\n`));
    }
  });

  it("keeps the routing, hiring and durable-work contracts", () => {
    const byName = ENGENTY_SPECIALISTS_MANAGED_SKILLS;
    const router = byName["work-routing"];
    expect(router).toContain("`message_agent` to a mounted Engenty");
    expect(router).toContain("Load **hire-agent**");
    expect(router).toContain("Load **durable-work**");

    const hire = byName["hire-agent"];
    expect(hire).toContain("Call `registry_agents_list` in this turn");
    expect(hire).toContain("`for_work`: `routine`");
    expect(hire).toContain("`routines_create`");
    expect(hire).toContain("reusing an existing id make it a gated proposal");
    expect(hire).not.toContain("never publish it yourself");
    // A Chief of Staff is the coordinator: fixed mandate, no Routine needed.
    expect(hire).toContain("## Hire a Chief of Staff (coordinator)");
    // The playbook is the hire's; the hiring agent must not go looking for it.
    expect(hire).toContain(
      "it is not in your catalog, so do not search for it"
    );
    expect(hire).toContain(
      "`for_work`: `chat`. The hire is complete without a Routine"
    );

    const durable = byName["durable-work"];
    expect(durable).toContain("Call `registry_agents_list` in this turn");
    expect(durable).toContain('Default `status: "todo"` IS the kickoff');
    expect(durable).toContain("invent `tasks_dispatch`");
    // An outcome too big for one Task becomes several Tasks with real
    // dependencies; nothing plans on anyone's behalf.
    expect(durable).toContain("blocked_by_task_ids");
    expect(durable).toContain("**routines** skill");
    expect(durable).not.toMatch(/goals?_\w+/);
    expect(router).not.toMatch(/goals?_\w+/);

    expect(byName["space-data"]).toContain("Artifacts");
  });

  it("states the routine contract once, where every engenty reads it", () => {
    // Prompt XOR Workflow, the promise, the wake sources, and that a person
    // may have the last word.
    const routines = ENGENTY_SPECIALISTS_MANAGED_SKILLS.routines;
    expect(routines).toContain("`prompt`");
    expect(routines).toContain("`workflow_id`");
    expect(routines).toContain("`outcome`");
    expect(routines).toContain("`ask_first: true`");
    expect(routines).toContain("Europe/Vienna");
    expect(routines).not.toContain("`instructions`");
  });
});
