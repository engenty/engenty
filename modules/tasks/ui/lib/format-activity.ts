import type {
  Task,
  TaskActivity,
  TaskComment,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { formatAgentTypeKey } from "./format-assignee.js";
import type { TASK_STATUS_FILLS } from "./task-status-styles.js";

type AssigneeProfiles = Map<string, { full_name: string; id: string }>;

export type ActivityActorKind = "agent" | "unknown" | "user";

export interface ActivityActor {
  avatarKey: string;
  colorKey: keyof typeof TASK_STATUS_FILLS;
  initials: string | null;
  kind: ActivityActorKind;
  label: string;
}

interface AssigneeSnapshot {
  agent_type_key?: string | null;
  kind?: string | null;
  user_id?: string | null;
}

const AVATAR_COLOR_KEYS = [
  "blue",
  "indigo",
  "teal",
  "green",
  "amber",
  "rose",
  "purple",
  "cyan",
] as const satisfies ReadonlyArray<keyof typeof TASK_STATUS_FILLS>;

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2_147_483_647;
  }
  return hash;
}

export function resolveAvatarColorKey(
  seed: string
): keyof typeof TASK_STATUS_FILLS {
  const index = hashString(seed) % AVATAR_COLOR_KEYS.length;
  return AVATAR_COLOR_KEYS[index] ?? "blue";
}

function resolveProfileName(
  userId: string | null | undefined,
  assigneeProfiles?: AssigneeProfiles
): string | null {
  if (!userId) {
    return null;
  }
  return assigneeProfiles?.get(userId)?.full_name ?? null;
}

function resolveAssigneeLabel(
  snapshot: AssigneeSnapshot | null | undefined,
  assigneeProfiles: AssigneeProfiles | undefined,
  t: (key: string) => string
): string {
  if (!snapshot?.kind || snapshot.kind === "none") {
    return t("detail.activityAssigneeNone");
  }
  if (snapshot.kind === "user") {
    return (
      resolveProfileName(snapshot.user_id, assigneeProfiles) ??
      t("detail.activityUnknownActor")
    );
  }
  if (snapshot.kind === "agent") {
    const key = snapshot.agent_type_key;
    return key ? formatAgentTypeKey(key) : t("detail.liveRunUnknownAgent");
  }
  return t("detail.activityUnknownActor");
}

export function resolveCommentActor(
  comment: TaskComment,
  assigneeProfiles: AssigneeProfiles | undefined,
  t: (key: string) => string
): ActivityActor {
  return resolveActivityActor(
    {
      actor_agent_type_key: comment.created_by_agent_type_key,
      actor_user_id: comment.created_by_user_id,
      created_at: comment.created_at,
      event_type: "tasks.comment_added",
      id: comment.id,
      payload: {},
      scope_id: comment.scope_id,
      task_id: comment.task_id,
      tenant_id: comment.tenant_id,
    },
    assigneeProfiles,
    t
  );
}

export type TaskCommentAudience = "agent" | "outside" | "team";

/** Team = assignee, creator, or collaborator; agent/outside render as elevated cards. */
export function resolveTaskCommentAudience(
  task: Pick<
    Task,
    "collaborator_user_ids" | "created_by_user_id" | "primary_assignee_user_id"
  >,
  comment: Pick<TaskComment, "created_by_agent_type_key" | "created_by_user_id">
): TaskCommentAudience {
  if (comment.created_by_agent_type_key) {
    return "agent";
  }
  const userId = comment.created_by_user_id;
  if (!userId) {
    return "outside";
  }
  if (
    userId === task.primary_assignee_user_id ||
    userId === task.created_by_user_id ||
    (task.collaborator_user_ids ?? []).includes(userId)
  ) {
    return "team";
  }
  return "outside";
}

export function resolveActivityActor(
  item: TaskActivity,
  assigneeProfiles: AssigneeProfiles | undefined,
  t: (key: string) => string
): ActivityActor {
  const agentKey =
    item.actor_agent_type_key ??
    (typeof item.payload.agent_type_key === "string"
      ? item.payload.agent_type_key
      : null);

  if (agentKey || item.event_type === "tasks.checked_out") {
    const label = agentKey
      ? formatAgentTypeKey(agentKey)
      : t("detail.liveRunUnknownAgent");
    return {
      avatarKey: agentKey ?? "agent",
      colorKey: "violet",
      initials: null,
      kind: "agent",
      label,
    };
  }

  if (item.actor_user_id) {
    const known = resolveProfileName(item.actor_user_id, assigneeProfiles);
    if (!known) {
      // A real user id that is not a team member is the AI service principal
      // acting on a headless run's behalf — "Someone" reads like a missing
      // audit trail when the actor is in fact known and non-human.
      return {
        avatarKey: "agent-service",
        colorKey: "violet",
        initials: null,
        kind: "agent",
        label: t("detail.activityAgentServiceActor"),
      };
    }
    return {
      avatarKey: item.actor_user_id,
      colorKey: resolveAvatarColorKey(item.actor_user_id),
      initials: getInitials(known),
      kind: "user",
      label: known,
    };
  }

  // No actor at all: an automatic transition (blocker resolution, dispatch
  // bookkeeping) rather than an unidentified person.
  return {
    avatarKey: "system",
    colorKey: "zinc",
    initials: null,
    kind: "agent",
    label: t("detail.activitySystemActor"),
  };
}

export function resolveTaskStatusLabel(
  status: string,
  definitions: TaskStatusDefinition[]
): string {
  return (
    definitions.find((definition) => definition.id === status)?.label ?? status
  );
}

export interface ActivityMessageContext {
  assigneeProfiles?: AssigneeProfiles;
  statusDefinitions: TaskStatusDefinition[];
  t: (key: string, options?: Record<string, unknown>) => string;
}

export type ActivityMessageKind =
  | "assignee_changed"
  | "checked_out"
  | "comment_added"
  | "generic"
  | "released"
  | "status_changed";

export interface ActivityMessage {
  assigneeFrom?: string;
  assigneeTo?: string;
  commentPreview?: string;
  kind: ActivityMessageKind;
  statusFrom?: string;
  statusTo?: string;
  textKey: string;
  textValues?: Record<string, unknown>;
}

export function buildActivityMessage(
  item: TaskActivity,
  context: ActivityMessageContext
): ActivityMessage {
  const { assigneeProfiles, statusDefinitions, t } = context;

  switch (item.event_type) {
    case "tasks.checked_out":
      return {
        kind: "checked_out",
        textKey: "detail.activityActorCheckedOut",
      };
    case "tasks.released":
      return {
        kind: "released",
        textKey: "detail.activityActorReleased",
      };
    case "tasks.status_changed": {
      const from = String(item.payload.from ?? "—");
      const to = String(item.payload.to ?? "—");
      return {
        kind: "status_changed",
        statusFrom: from,
        statusTo: to,
        textKey: "detail.activityActorStatusChanged",
        textValues: {
          from: resolveTaskStatusLabel(from, statusDefinitions),
          to: resolveTaskStatusLabel(to, statusDefinitions),
        },
      };
    }
    case "tasks.assignee_changed": {
      const from = resolveAssigneeLabel(
        item.payload.from as AssigneeSnapshot | undefined,
        assigneeProfiles,
        t
      );
      const to = resolveAssigneeLabel(
        item.payload.to as AssigneeSnapshot | undefined,
        assigneeProfiles,
        t
      );
      return {
        kind: "assignee_changed",
        assigneeFrom: from,
        assigneeTo: to,
        textKey: "detail.activityActorAssigneeChanged",
        textValues: { from, to },
      };
    }
    case "tasks.comment_added": {
      const preview =
        typeof item.payload.content === "string"
          ? item.payload.content
          : typeof item.payload.preview === "string"
            ? item.payload.preview
            : undefined;
      return {
        kind: "comment_added",
        commentPreview: preview,
        textKey: "detail.activityActorCommentAdded",
      };
    }
    default:
      return {
        kind: "generic",
        textKey: "detail.activityGeneric",
        textValues: { event: item.event_type },
      };
  }
}

const COMMENT_PREVIEW_MAX_LENGTH = 48;

/** Single-line comment snippet for activity/feed rows (full text lives on Comments tab). */
export function truncateCommentPreview(
  content: string,
  maxLength = COMMENT_PREVIEW_MAX_LENGTH
): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}

export function hasExpandableActivityPayload(item: TaskActivity): boolean {
  const keys = Object.keys(item.payload ?? {});
  if (keys.length === 0) {
    return false;
  }
  if (item.event_type === "tasks.status_changed") {
    return keys.some((key) => key !== "from" && key !== "to");
  }
  if (item.event_type === "tasks.assignee_changed") {
    return keys.some((key) => key !== "from" && key !== "to");
  }
  if (item.event_type === "tasks.comment_added") {
    return keys.some(
      (key) => key !== "preview" && key !== "comment_id" && key !== "content"
    );
  }
  return true;
}

export function formatActivityPayload(item: TaskActivity): string {
  return JSON.stringify(item.payload ?? {}, null, 2);
}
