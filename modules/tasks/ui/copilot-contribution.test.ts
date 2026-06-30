import { describe, expect, it } from "vitest";
import {
  tasksBriefingCopilotContribution,
  tasksCopilotContribution,
} from "./copilot-contribution.js";

describe("tasksCopilotContribution", () => {
  it("matches tasks module scope", () => {
    expect(
      tasksCopilotContribution.matches?.({
        scope: { currentModule: "tasks" },
      } as never)
    ).toBe(true);
    expect(
      tasksCopilotContribution.matches?.({
        scope: { currentModule: "projects" },
      } as never)
    ).toBe(false);
  });

  it("includes starter prompts", () => {
    expect(tasksCopilotContribution.starterPrompts?.length).toBeGreaterThan(0);
  });
});

describe("tasksBriefingCopilotContribution", () => {
  it("matches tasks briefing route scope", () => {
    expect(
      tasksBriefingCopilotContribution.matches?.({
        scope: { currentModule: "tasks", routeKey: "briefing" },
      } as never)
    ).toBe(true);
    expect(
      tasksBriefingCopilotContribution.matches?.({
        scope: { currentModule: "tasks", routeKey: "list" },
      } as never)
    ).toBe(false);
  });
});
