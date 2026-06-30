/** Thrown when PATCH project tries to drop a member who is still on a task. */
export class ProjectMemberRemovalBlockedError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super(
      "Cannot remove team member from project: still assigned to one or more tasks"
    );
    this.name = "ProjectMemberRemovalBlockedError";
    this.userId = userId;
  }
}
