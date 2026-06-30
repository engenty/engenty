import type { Goal, Task } from "../../src/schema/types.js";

export interface GoalTaskSection {
  goal: Goal | { id: string; title: string };
  tasks: Task[];
}

export interface GroupedTasksByGoal {
  generalTasks: Task[];
  goalSections: GoalTaskSection[];
}

function goalSortKey(goal: Goal | { id: string; title: string }): string {
  return goal.title.trim().toLowerCase();
}

/** Groups tasks into general (no goal) and per-goal sections sorted by goal title. */
export function groupTasksByGoal(
  tasks: Task[],
  goals: Goal[]
): GroupedTasksByGoal {
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const generalTasks: Task[] = [];
  const tasksByGoalId = new Map<string, Task[]>(
    goals.map((goal) => [goal.id, [] as Task[]])
  );

  for (const task of tasks) {
    if (!task.goal_id) {
      generalTasks.push(task);
      continue;
    }
    if (!tasksByGoalId.has(task.goal_id)) {
      tasksByGoalId.set(task.goal_id, []);
    }
    tasksByGoalId.get(task.goal_id)?.push(task);
  }

  const goalSections: GoalTaskSection[] = [...tasksByGoalId.entries()]
    .map(([goalId, goalTasks]) => ({
      goal: goalById.get(goalId) ?? { id: goalId, title: goalId },
      tasks: goalTasks,
    }))
    .sort((a, b) => goalSortKey(a.goal).localeCompare(goalSortKey(b.goal)));

  return { generalTasks, goalSections };
}
