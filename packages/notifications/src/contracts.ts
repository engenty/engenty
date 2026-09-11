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
  // Core's approval gate, whatever module the operation belongs to. The
  // older name is kept for rows written before the rename.
  approval_requested: "decision",
  connection_approval_requested: "decision",
  routine_failed: "alert",
  skill_proposed: "decision",
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
  "team_chat.message": "update",
  tool_approval: "decision",
  workflow_proposed: "decision",
} as const satisfies Record<string, NotificationClass>;

export type BuiltinNotificationKind = keyof typeof BUILTIN_NOTIFICATION_KINDS;

/** Classes that count on the badge. `update` is FYI and never does. */
export const BADGE_CLASSES: readonly NotificationClass[] = [
  "decision",
  "alert",
  "todo",
];

export function isBadgeClass(cls: NotificationClass): boolean {
  return BADGE_CLASSES.includes(cls);
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
  summary: string;
  tenant_id: string;
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
