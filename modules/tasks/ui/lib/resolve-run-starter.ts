import type { TaskActivity } from "../../src/schema/types.js";

export function resolveRunStarterLabel(
  runId: string,
  activity: TaskActivity[],
  assigneeProfiles?: Map<string, { full_name: string; id: string }>
): string | null {
  const checkout = activity.find(
    (item) =>
      item.event_type === "tasks.checked_out" && item.payload.run_id === runId
  );
  if (!checkout?.actor_user_id) {
    return null;
  }
  return (
    assigneeProfiles?.get(checkout.actor_user_id)?.full_name ??
    checkout.actor_user_id.slice(0, 8)
  );
}
