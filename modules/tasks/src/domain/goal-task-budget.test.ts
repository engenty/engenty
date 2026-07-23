import { describe, expect, it } from "vitest";
import {
  checkGoalTaskBudget,
  type GoalTaskGuardTask,
  MAX_OPEN_AGENT_TASKS_PER_GOAL,
  normalizeTaskTitle,
} from "./goal-task-budget.js";

let seq = 0;
function task(overrides: Partial<GoalTaskGuardTask> = {}): GoalTaskGuardTask {
  seq += 1;
  return {
    id: `task-${seq}`,
    identifier: `ENG-${seq}`,
    primary_assignee_kind: "agent",
    status: "todo",
    title: `Step ${seq}`,
    ...overrides,
  };
}

describe("normalizeTaskTitle", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeTaskTitle("Review: Duplikat-Vorschläge  prüfen!")).toBe(
      normalizeTaskTitle("review duplikat vorschlage prufen")
    );
  });
});

describe("checkGoalTaskBudget", () => {
  it("allows a genuinely new step", () => {
    expect(checkGoalTaskBudget([task({ title: "Analyse" })], "Merge")).toEqual({
      kind: "allow",
    });
  });

  // An honest retry, or a planner re-proposing the same step, must return the
  // existing task instead of doubling the plan.
  it("reports an exact repeat as a duplicate", () => {
    const existing = task({ title: "Merge und Bereinigung anwenden" });
    const verdict = checkGoalTaskBudget(
      [existing],
      "  merge und bereinigung anwenden  "
    );
    expect(verdict).toEqual({ existing, kind: "duplicate" });
  });

  it("ignores terminal tasks when matching duplicates", () => {
    const done = task({ status: "done", title: "Merge" });
    expect(checkGoalTaskBudget([done], "Merge")).toEqual({ kind: "allow" });
  });

  // The real runaway drifted its wording every round, so the count — not
  // similarity — is what actually stops it.
  it("refuses once the goal holds too many open agent tasks", () => {
    const siblings = Array.from({ length: MAX_OPEN_AGENT_TASKS_PER_GOAL }, () =>
      task()
    );
    expect(checkGoalTaskBudget(siblings, "One more")).toEqual({
      kind: "budget_exhausted",
      open: MAX_OPEN_AGENT_TASKS_PER_GOAL,
    });
  });

  it("does not count finished or human tasks toward the budget", () => {
    const siblings = [
      ...Array.from({ length: MAX_OPEN_AGENT_TASKS_PER_GOAL }, () =>
        task({ status: "done" })
      ),
      ...Array.from({ length: MAX_OPEN_AGENT_TASKS_PER_GOAL }, () =>
        task({ primary_assignee_kind: "user" })
      ),
    ];
    expect(checkGoalTaskBudget(siblings, "One more")).toEqual({
      kind: "allow",
    });
  });

  it("reproduces the observed runaway: the 9th step is refused", () => {
    // 14 tasks were created for one goal in 73s; the guard stops it at 8.
    const siblings: GoalTaskGuardTask[] = [];
    let refusedAt: number | null = null;
    for (let i = 1; i <= 14; i += 1) {
      const verdict = checkGoalTaskBudget(siblings, `Schritt ${i}`);
      if (verdict.kind === "budget_exhausted") {
        refusedAt = i;
        break;
      }
      siblings.push(task({ title: `Schritt ${i}` }));
    }
    expect(refusedAt).toBe(MAX_OPEN_AGENT_TASKS_PER_GOAL + 1);
  });
});
