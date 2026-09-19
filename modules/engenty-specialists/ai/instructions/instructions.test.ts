import { describe, expect, it } from "vitest";
import {
  renderSpecialistAppendix,
  SPECIALIST_REPORT_INSTRUCTIONS,
  specialistInstructionParts,
} from "./index.js";

const memory = "## Memory\n\nRemember things.";
const tasks = "## Tasks\n\nTrack things.";

describe("specialist instructions", () => {
  it("composes memory and tasks into the appendix, between catalog writes and the look", () => {
    const body = renderSpecialistAppendix({ memory, tasks });
    expect(body).not.toContain("{{MEMORY_AND_TASKS}}");
    const catalog = body.indexOf("## Catalog writes");
    const mem = body.indexOf("## Memory");
    const tsk = body.indexOf("## Tasks");
    const look = body.indexOf("## Your look");
    expect(catalog).toBeGreaterThan(-1);
    expect(mem).toBeGreaterThan(catalog);
    expect(tsk).toBeGreaterThan(mem);
    expect(look).toBeGreaterThan(tsk);
  });

  it("tells every specialist about routines, Space Data, colleagues and its look", () => {
    const body = renderSpecialistAppendix({ memory, tasks });
    for (const heading of [
      "## Workspace and memory",
      "## Your routines",
      "## Space Data",
      "## Catalog writes",
      "## Your look",
    ]) {
      expect(body).toContain(heading);
    }
    expect(body).toContain("load **routines** first");
    expect(body).toContain("`routines_create` returned `created`");
    expect(body).toContain("`agent_look`");
  });

  it("adds the hand-over section for a report, not for a coordinator", () => {
    const report = specialistInstructionParts({
      memory,
      tasks,
      topLevel: false,
    });
    expect(report).toHaveLength(2);
    expect(report[1]).toBe(SPECIALIST_REPORT_INSTRUCTIONS);
    expect(report[1]).toContain("## What your coordinator owns");
    expect(report[1]).toContain("Never answer that it cannot be done.");

    const coordinator = specialistInstructionParts({
      memory,
      tasks,
      topLevel: true,
    });
    expect(coordinator).toHaveLength(1);
    expect(coordinator[0]).not.toContain("## What your coordinator owns");
  });

  it("does not re-teach the retired work model", () => {
    // Mirrors scripts/check-work-vocabulary.mjs: a routine is its own record,
    // a fire starts a Run and creates no Task.
    const text = [
      renderSpecialistAppendix({ memory, tasks }),
      SPECIALIST_REPORT_INSTRUCTIONS,
    ].join("\n");
    expect(text).not.toMatch(/standing[ _-]task/i);
    expect(text).not.toMatch(/a\s+routine\s+is\s+(a|one)\s+standing/i);
  });
});
