import type { NotificationDto } from "./api.js";

/**
 * Catalog pages live at `/admin/engenty/workflows/:id`. The previous
 * `/flows/` segment is not a registered route, so it fell through the app
 * catch-all onto Copilot chat.
 */
const WORKFLOWS_CATALOG_PATH = "/admin/engenty/workflows";
const WORKFLOWS_CATALOG_LEGACY_FLOWS_PATH = "/admin/engenty/flows";

function canonicalizeNotificationHref(href: string): string {
  if (
    href === WORKFLOWS_CATALOG_LEGACY_FLOWS_PATH ||
    href.startsWith(`${WORKFLOWS_CATALOG_LEGACY_FLOWS_PATH}/`)
  ) {
    return `${WORKFLOWS_CATALOG_PATH}${href.slice(WORKFLOWS_CATALOG_LEGACY_FLOWS_PATH.length)}`;
  }
  return href;
}

/**
 * Where the row leads. The subject names the thing the record is about; a
 * task lives in the tasks module, a run on its Engenty's desk, a workflow
 * proposal in the catalog. A payload `route` (team-chat) wins outright.
 */
export function notificationHref(
  notification: NotificationDto,
  spaceKey?: string
): string | null {
  const route = notification.payload?.route;
  if (typeof route === "string" && route.startsWith("/")) {
    return canonicalizeNotificationHref(route);
  }
  const taskId =
    notification.subject_type === "task"
      ? notification.subject_id
      : typeof notification.metadata?.task_id === "string"
        ? notification.metadata.task_id
        : null;
  if (taskId) {
    return spaceKey
      ? `/s/${encodeURIComponent(spaceKey)}/tasks/${encodeURIComponent(taskId)}`
      : `/mdl/tasks/${encodeURIComponent(taskId)}`;
  }
  if (notification.kind === "agent_proposed") {
    return spaceKey
      ? `/s/${encodeURIComponent(spaceKey)}/agents`
      : "/admin/engenty";
  }
  const workflowId = notification.metadata?.workflow_id;
  if (typeof workflowId === "string") {
    return `${WORKFLOWS_CATALOG_PATH}/${encodeURIComponent(workflowId)}`;
  }
  const origin = notificationOrigin(notification);
  const space = origin.spaceKey ?? spaceKey ?? null;
  if (notification.kind === "agent_hired") {
    const agentId = notification.metadata?.agent_id;
    if (typeof agentId === "string") {
      return space
        ? `/s/${encodeURIComponent(space)}/agents/${encodeURIComponent(agentId)}`
        : "/admin/engenty";
    }
  }
  // A conversation on an Engenty's desk: a parked run, an agent message, a
  // finished hand-off. The record names the thread and whose desk it is on
  // (`thread_agent_id`, else the actor). Older rows carry neither.
  const threadId = notification.metadata?.thread_id;
  const deskAgentId =
    typeof notification.metadata?.thread_agent_id === "string"
      ? notification.metadata.thread_agent_id
      : notification.actor_kind === "agent"
        ? notification.actor_id
        : null;
  if (space && deskAgentId && typeof threadId === "string") {
    return `/s/${encodeURIComponent(space)}/agents/${encodeURIComponent(
      deskAgentId
    )}?engagement=${encodeURIComponent(`conversation:${threadId}`)}`;
  }
  return null;
}

/** Who asked and where, off the origin keys the producer stamped (v4 §2.1). */
export function notificationOrigin(notification: NotificationDto): {
  actorLabel: string | null;
  spaceKey: string | null;
  spaceName: string | null;
} {
  const read = (key: string) => {
    const value = notification.metadata?.[key];
    return typeof value === "string" && value.trim() ? value : null;
  };
  return {
    actorLabel: read("actor_label"),
    spaceKey: read("space_key"),
    spaceName: read("space_name"),
  };
}
