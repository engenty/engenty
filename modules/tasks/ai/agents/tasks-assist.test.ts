import { describe, expect, it } from "vitest";
import {
  buildTasksAssistSystemPrompt,
  tasksAssistAgentConfig,
} from "./tasks-assist.js";

describe("buildTasksAssistSystemPrompt", () => {
  it("injects preloaded task snapshot without requiring tools", async () => {
    const prompt = await buildTasksAssistSystemPrompt({
      entityId: "task-1",
      task_snapshot: {
        title: "Ship tasks module",
        status: "in_progress",
      },
    });

    expect(prompt).toContain("Current task (preloaded");
    expect(prompt).toContain("Ship tasks module");
    expect(prompt).toContain("task-workflow skill");
  });

  it("mentions goals preview when present", async () => {
    const prompt = await buildTasksAssistSystemPrompt({
      goals_preview: [{ id: "goal-1", title: "Q2 launch", status: "active" }],
    });

    expect(prompt).toContain("Visible goals");
    expect(prompt).toContain("Q2 launch");
  });

  it("injects briefing snapshot for prioritization questions", async () => {
    const prompt = await buildTasksAssistSystemPrompt({
      tasks_briefing_snapshot: {
        mode: "personal",
        focus_count: 2,
        focus_tasks: [{ id: "t1", title: "Review PR", status: "todo" }],
      },
    });

    expect(prompt).toContain("Tasks briefing snapshot");
    expect(prompt).toContain("Review PR");
  });
});

describe("tasksAssistAgentConfig", () => {
  it("uses the staff workspace preset so the harness mounts /task when checkout-bound", () => {
    // The staff preset includes /home (agent-scoped), /shared (tenant), /skills (ro),
    // and /task (rw, requireBinding). The harness drops /task when the session is not
    // checkout-bound, so unbound copilot runs are unaffected.
    expect(tasksAssistAgentConfig.workspace).toEqual({ preset: "staff" });
  });

  it("declares the task-workflow skill", () => {
    expect(tasksAssistAgentConfig.skillIds).toContain("task-workflow");
  });
});
