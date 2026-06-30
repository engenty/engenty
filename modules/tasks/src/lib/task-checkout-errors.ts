export interface TaskCheckoutConflictDetail {
  checkout_run_id: string | null;
  current_assignee_kind: string;
  current_status: string;
}

export class TaskCheckoutConflictError extends Error {
  readonly code = "task_checkout_conflict" as const;
  readonly conflict: TaskCheckoutConflictDetail;

  constructor(conflict: TaskCheckoutConflictDetail) {
    super("task_checkout_conflict");
    this.name = "TaskCheckoutConflictError";
    this.conflict = conflict;
  }
}
