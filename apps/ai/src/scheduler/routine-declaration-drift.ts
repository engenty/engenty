// Pure drift check for module ROUTINE.md → trigger/template reconcile.
// Declaration-owned fields only — never compare user-owned enabled/cron/etc.

export interface RoutineDeclarationDesired {
  description: string | null;
  template: {
    agent_type_key: string;
    description: string | null;
    priority: string;
    title: string;
  };
}

export interface RoutineDeclarationExisting {
  description: string | null;
  task_template: {
    agent_type_key: string;
    description: string | null;
    priority: string;
    title: string;
  } | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** True when any declaration-owned field differs after trim. */
export function routineDeclarationDrifted(
  existing: RoutineDeclarationExisting,
  desired: RoutineDeclarationDesired
): boolean {
  if (norm(existing.description) !== norm(desired.description)) {
    return true;
  }
  const template = existing.task_template;
  if (!template) {
    return true;
  }
  return (
    norm(template.agent_type_key) !== norm(desired.template.agent_type_key) ||
    norm(template.description) !== norm(desired.template.description) ||
    norm(template.priority) !== norm(desired.template.priority) ||
    norm(template.title) !== norm(desired.template.title)
  );
}
