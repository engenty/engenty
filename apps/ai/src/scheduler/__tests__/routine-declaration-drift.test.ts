import { describe, expect, it } from "vitest";
import { routineDeclarationDrifted } from "../routine-declaration-drift.js";

const desired = {
  description: "1. Reap.\n2. Report.",
  template: {
    agent_type_key: "engenty.coordinator",
    description: "Hourly cycle",
    priority: "medium",
    title: "Coordinator heartbeat",
  },
};

const matching = {
  description: "1. Reap.\n2. Report.",
  task_template: {
    agent_type_key: "engenty.coordinator",
    description: "Hourly cycle",
    priority: "medium",
    title: "Coordinator heartbeat",
  },
};

describe("routineDeclarationDrifted", () => {
  it("returns false when identical", () => {
    expect(routineDeclarationDrifted(matching, desired)).toBe(false);
  });

  it("returns false when only whitespace differs", () => {
    expect(
      routineDeclarationDrifted(
        {
          ...matching,
          description: "  1. Reap.\n2. Report.  ",
          task_template: {
            ...matching.task_template,
            description: " Hourly cycle ",
            title: "  Coordinator heartbeat",
          },
        },
        desired
      )
    ).toBe(false);
  });

  it("returns true when description drifted", () => {
    expect(
      routineDeclarationDrifted(
        { ...matching, description: "new body" },
        desired
      )
    ).toBe(true);
  });

  it("returns true when template title drifted", () => {
    expect(
      routineDeclarationDrifted(
        {
          ...matching,
          task_template: {
            ...matching.task_template,
            title: "Other title",
          },
        },
        desired
      )
    ).toBe(true);
  });

  it("returns true when template is missing", () => {
    expect(
      routineDeclarationDrifted(
        { description: desired.description, task_template: null },
        desired
      )
    ).toBe(true);
  });
});
