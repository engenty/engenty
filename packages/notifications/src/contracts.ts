// Isomorphic contracts: the kind table, the record shape and the channel
// interface. No runtime imports so the UI can `import type` from here.

export type NotificationClass = "decision" | "alert" | "todo" | "update";
export type NotificationPriority = "low" | "medium" | "high" | "urgent";
/**
 * `pending` is open. Seen is not a status: it is per viewer
 * (`core.notification_seen`), because a shared row is read by many people
 * and answered by one. `resolved` = the subject moved on; `dismissed` = a
 * person cleared an alert or an FYI. A decision is never dismissed, only
 * decided.
 */
export type NotificationStatus = "pending" | "dismissed" | "resolved";
/**
 * Why a record was resolved: the subject moved on (`resumed`, `completed`,
 * `failed`), a person decided it (`decided`), nobody did before the subject
 * expired or was lost (`expired`), or the ask was closed without an answer
 * (`abandoned` — a chat interrupt dismissed or healed). Stamped as
 * `metadata.resolved_reason`.
 */
export type NotificationResolveOutcome =
  | "resumed"
  | "completed"
  | "failed"
  | "decided"
  | "expired"
  | "abandoned";
/**
 * Who a record is FOR — who sees it and gets the badge. `space` = everyone
 * who may enter the space; `tenant` = every member. The right to resolve it
 * is never on the record: it belongs to the subject (the approval request's
 * owner rule, the thread's write access), and the first person to answer
 * wins.
 */
export type NotificationAudienceKind = "tenant" | "user" | "stream" | "space";
export type NotificationActorKind = "agent" | "user" | "system";

/**
 * What each class means for the person on the other end. A notification is a
 * signal, never a work item: a `todo` points at the task or escalation it is
 * about, it is not the task.
 *
 * - decision — a run is suspended, waiting on a person
 * - alert    — something failed and someone must act
 * - todo     — a person is asked to do something (assignment, review, escalation)
 * - update   — FYI
 */
export const BUILTIN_NOTIFICATION_KINDS = {
  action_failed: "alert",
  action_gate: "decision",
  action_question: "decision",
  // A hire that went live without a card (tool-less agent, known space).
  agent_hired: "update",
  // An Engenty left a note on its desk without being asked (`desk_post`,
  // a routine report, a welcome) — the people in the Space were not watching.
  agent_desk_post: "update",
  // One Engenty spoke to another: a hand-off, an ask, or the reply.
  agent_message_received: "update",
  agent_proposed: "decision",
  // An agent on a desk asked the people in the thread something
  // (`requestDecision` / `requestFeedback`); answered in the chat.
  agent_question: "decision",
  agent_run_suspended: "decision",
  // An App version is built and inert until someone with `apps.approve`
  // activates it.
  app_release_proposed: "decision",
  // A colleague finished work it was handed (notify mode); carries the
  // report's first line.
  agent_work_completed: "update",
  // Core's approval gate, whatever module the operation belongs to.
  approval_requested: "decision",
  // An agent gave itself (or a colleague) a standing job without a card —
  // the mode allowed it; the people in the Space still get to know.
  routine_created: "update",
  routine_failed: "alert",
  // A routine outcome binding landed in the Updates lane (`notification.update`
  // / `notification.high`). Class stays `update`; high/urgent priority is what
  // the bell counts (owned by the badge change).
  routine_outcome: "update",
  // A routine with `report: ask` finished and holds until someone has looked.
  routine_review: "decision",
  skill_proposed: "decision",
  // An agent found a remote MCP server on the Space computer; importing it
  // as a connector takes a tenant admin.
  connector_import_requested: "decision",
  stream_escalation: "todo",
  stream_update: "update",
  task_assigned: "todo",
  task_completed: "update",
  task_failed: "alert",
  task_needs_input: "decision",
  task_question: "decision",
  task_review_requested: "todo",
  // An agent principal ran a non-trivial write operation (core's
  // `operation.afterInvoke`, medium+ risk); batches coalesce.
  records_written: "update",
  // A room hit its agent-turn budget and waits for a person to resume it.
  room_paused: "todo",
  "team_chat.message": "update",
  tool_approval: "decision",
  workflow_proposed: "decision",
} as const satisfies Record<string, NotificationClass>;

export type BuiltinNotificationKind = keyof typeof BUILTIN_NOTIFICATION_KINDS;

/**
 * Classes that always need attention. An `update` is FYI and stays out
 * unless `priority` is `high` or `urgent` — same exception `channelsFor`
 * uses for web push. The row still lives in the Updates lane.
 */
export const ATTENTION_CLASSES: readonly NotificationClass[] = [
  "decision",
  "alert",
  "todo",
];

/** Priorities that make an `update` need attention. */
export const ATTENTION_UPDATE_PRIORITIES: readonly NotificationPriority[] = [
  "high",
  "urgent",
];

/**
 * "Needs attention" (Wichtig): an OPEN record that is a decision, todo or
 * alert, or a high/urgent update. The one rule behind the bell, the
 * attention count, the Wichtig lane and the space dashboard — seen or not:
 * an attention record nags until handled (a decision until resolved, an FYI
 * until dismissed). The UI mirrors it in
 * `packages/notifications-ui/src/classification.ts`.
 */
export function isAttention(
  record: Pick<NotificationRecord, "class" | "priority" | "status">
): boolean {
  if (record.status !== "pending") {
    return false;
  }
  if (ATTENTION_CLASSES.includes(record.class)) {
    return true;
  }
  return (
    record.class === "update" &&
    ATTENTION_UPDATE_PRIORITIES.includes(record.priority)
  );
}

export type NotificationAudience =
  | { kind: "tenant" }
  | { kind: "user"; userId: string }
  | { kind: "stream"; key: string }
  | { kind: "space"; spaceId: string };

export interface NotificationSubject {
  id: string;
  type: string;
}

export interface NotificationActor {
  id?: string | null;
  kind: NotificationActorKind;
}

export interface NotificationRecord {
  actor_id: string | null;
  actor_kind: NotificationActorKind | null;
  audience_id: string | null;
  audience_kind: NotificationAudienceKind;
  /** One plain line under the title (≤140), never raw agent output. */
  body: string | null;
  class: NotificationClass;
  coalesce_key: string | null;
  coalesced_count: number;
  created_at: string;
  dedupe_key: string | null;
  dismissed_at: string | null;
  id: string;
  kind: string;
  metadata: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  priority: NotificationPriority;
  resolved_at: string | null;
  source: string;
  space_id: string | null;
  status: NotificationStatus;
  subject_id: string | null;
  subject_type: string | null;
  /** English one-liner: the title as the server says it (push, mail, fallback). */
  summary: string;
  /** In-app route of the subject, with the record's own space. */
  target: string | null;
  tenant_id: string;
  /** `notifications.titles.<key>` — what the UI says, in the viewer's language. */
  title_key: string | null;
  title_params: Record<string, string | number> | null;
  updated_at: string;
}

/** A record as one person sees it: `seen` is theirs, the row is shared. */
export type NotificationView = NotificationRecord & { seen: boolean };

export type DeliveryStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

export interface NotificationDelivery {
  attempts: number;
  channel: string;
  created_at: string;
  id: string;
  last_error: string | null;
  not_before: string;
  notification_id: string;
  sent_at: string | null;
  status: DeliveryStatus;
  target: Record<string, unknown>;
  tenant_id: string;
}

/**
 * The delivery target a channel row carries. `user_id` is set for every
 * subscriber of a record (the addressed person, or the people behind a
 * shared row); streams carry the route target (a messenger thread, a
 * mailbox) instead.
 */
export interface ChannelTarget {
  user_id?: string;
  [key: string]: unknown;
}

export interface ChannelContext {
  tenantId: string;
}

/**
 * A transport. Registered per process — the delivery loop of the process that
 * registered a channel is the only one that claims its rows.
 */
export interface NotificationChannel {
  /** Last word before sending; false marks the delivery `skipped`. */
  accepts?(record: NotificationRecord, target: ChannelTarget): boolean;
  deliver(
    record: NotificationRecord,
    target: ChannelTarget,
    ctx: ChannelContext
  ): Promise<void>;
  id: string;
}

/**
 * Which channels a class fans out to by default. `in_app` is the record
 * itself (realtime on the table) and needs no delivery row.
 */
export const CLASS_CHANNEL_DEFAULTS: Record<NotificationClass, string[]> = {
  alert: ["web_push", "email"],
  decision: ["web_push", "email"],
  todo: ["web_push", "email"],
  update: ["web_push", "email"],
};

export interface NotificationStream {
  created_at: string;
  created_by_user_id: string | null;
  description: string | null;
  id: string;
  key: string;
  name: string;
  space_id: string | null;
  tenant_id: string;
  updated_at: string;
}

export interface NotificationRoute {
  channel: string;
  created_at: string;
  enabled: boolean;
  id: string;
  min_priority: NotificationPriority;
  stream_id: string;
  target: Record<string, unknown>;
  tenant_id: string;
}

export const PRIORITY_RANK: Record<NotificationPriority, number> = {
  high: 2,
  low: 0,
  medium: 1,
  urgent: 3,
};

/**
 * Per-user channel preference on `core.user_settings`, keyed
 * `notifications.<class>.<channel>`: `on` (default), `off`, or `digest`
 * (email only, batched by the delay — push stays off).
 */
export type ChannelPreference = "on" | "off" | "digest";

export interface UserNotificationPrefs {
  channels: Partial<
    Record<`${NotificationClass}.${string}`, ChannelPreference>
  >;
  /** "HH:MM-HH:MM" in `quietHoursTimeZone` (IANA) or UTC. */
  quietHours: string | null;
  quietHoursTimeZone: string | null;
}

/** Module events the host emits after every write. */
export const NOTIFICATIONS_CREATED_EVENT = "notifications.created";
export const NOTIFICATIONS_RESOLVED_EVENT = "notifications.resolved";
