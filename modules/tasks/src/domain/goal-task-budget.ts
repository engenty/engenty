// Guards against an agent re-planning the same goal over and over.
//
// Observed 2026-07-23: a single coordinator run created 14 tasks for one goal
// in 73 seconds — the same four-step plan four times over, each round phrasing
// the steps slightly differently ("Erkennung von Duplikaten" →
// "Analyse: Duplikate identifizieren" → "Analyse: Duplikaterkennung
// durchführen"). It then audited its own output, concluded the duplicates were
// pre-existing, and reported "no new tasks created".
//
// Two lessons shape this guard:
//
//  1. The agent cannot be trusted to notice its own loop, so the stop has to
//     live at the tool boundary, not in a prompt.
//  2. Title similarity cannot be the test. The titles drifted every round and
//     no reasonable threshold separates "same step, reworded" from "genuinely
//     different step" — so an exact (normalized) match is treated as a repeat,
//     and everything beyond that is bounded by a plain count instead.

import type { Task } from "../schema/types.js";
import { TASK_TERMINAL_STATUSES } from "./task-lifecycle.js";

/**
 * How many open agent tasks one goal may hold before further creation is
 * refused. A real plan for a goal is a handful of steps; the observed runaway
 * produced 14. This bounds the blast radius of any looping planner without
 * judging what the tasks mean.
 */
export const MAX_OPEN_AGENT_TASKS_PER_GOAL = 8;

/** Case/whitespace/punctuation-insensitive title identity. */
export function normalizeTaskTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isOpen(task: Pick<Task, "status">): boolean {
  return !TASK_TERMINAL_STATUSES.has(task.status);
}

export type GoalTaskGuardTask = Pick<
  Task,
  "id" | "identifier" | "primary_assignee_kind" | "status" | "title"
>;

export type GoalTaskGuardVerdict =
  | { kind: "allow" }
  | { existing: GoalTaskGuardTask; kind: "duplicate" }
  | { kind: "budget_exhausted"; open: number };

/**
 * Decide whether a new task may be created for a goal.
 *
 * `duplicate` means an open task on the same goal already carries this exact
 * title — the caller should return that task rather than create a second one,
 * so an honest retry is idempotent instead of doubling the plan.
 */
export function checkGoalTaskBudget(
  siblings: readonly GoalTaskGuardTask[],
  title: string,
  limit: number = MAX_OPEN_AGENT_TASKS_PER_GOAL
): GoalTaskGuardVerdict {
  const open = siblings.filter(isOpen);
  const normalized = normalizeTaskTitle(title);
  const duplicate = open.find(
    (task) => normalizeTaskTitle(task.title) === normalized
  );
  if (duplicate) {
    return { existing: duplicate, kind: "duplicate" };
  }
  const openAgentTasks = open.filter(
    (task) => task.primary_assignee_kind === "agent"
  ).length;
  if (openAgentTasks >= limit) {
    return { kind: "budget_exhausted", open: openAgentTasks };
  }
  return { kind: "allow" };
}
