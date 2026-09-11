// The notifications service: emit, resolve, list, count, seen, dismiss.
//
// Emit resolves the audience (explicit target, else the ladder: place before
// person), derives the class from a registered kind, coalesces on
// `dedupe_key` while the previous record is still pending, inserts the row
// and writes one delivery-ledger row per subscriber and channel. Delivery
// itself happens elsewhere (channels/registry.ts). Seen is per viewer
// (`notification_seen`); resolve and dismiss are the row's.
import {
  BUILTIN_NOTIFICATION_KINDS,
  CLASS_CHANNEL_DEFAULTS,
  type NotificationActor,
  type NotificationAudience,
  type NotificationClass,
  type NotificationPriority,
  type NotificationRecord,
  type NotificationResolveOutcome,
  type NotificationSubject,
  type NotificationView,
  PRIORITY_RANK,
  type UserNotificationPrefs,
} from "./contracts.js";
import {
  type AudienceScope,
  createNotificationsStore,
  type ListNotificationsParams,
  type NotificationsDbSource,
  type NotificationsStore,
} from "./dal/store.js";
import { type OriginLookups, resolveOrigin } from "./origin.js";

export interface EmitNotificationInput {
  actor?: NotificationActor | null;
  /**
   * Task lanes: the task's primary assignee. The audience of assigned work
   * (`todo`) and of a decision on a task outside any space; a subscriber
   * otherwise.
   */
  assigneeUserId?: string | null;
  /** Explicit target. Absent → the ladder below decides. */
  audience?: NotificationAudience | null;
  coalesceKey?: string | null;
  /**
   * With a coalesce key: only merge into a row touched within this window
   * (a batch); absent = the one open row, however old (an open ask).
   */
  coalesceWindowMs?: number;
  /** Dedupe while pending — a second emit merges instead of duplicating. */
  dedupeKey?: string | null;
  /**
   * Presses and chat: whoever started the run. Subscribed to delivery; the
   * audience only for an FYI. Shared work is addressed to its place.
   */
  initiatorUserId?: string | null;
  kind: string;
  metadata?: Record<string, unknown> | null;
  /** Routine fires: the routine's owner. Subscribed, like the initiator. */
  ownerUserId?: string | null;
  /**
   * A subject only some people may see (a private room, a personal thread):
   * its people, one row each. Wins over the space.
   */
  participantUserIds?: readonly string[] | null;
  payload?: Record<string, unknown> | null;
  /**
   * People who already have this in front of them — the person whose turn
   * just parked on the card. Their view of the row starts seen, so their own
   * bell does not blink for what they are looking at.
   */
  preSeenUserIds?: readonly string[] | null;
  priority?: NotificationPriority;
  source: string;
  /** The place. A shared decision, alert or todo is addressed to it. */
  spaceId?: string | null;
  subject?: NotificationSubject | null;
  /**
   * People pushed and mailed about a shared row, on top of the owner,
   * initiator and assignee. Everyone in the audience gets the badge and the
   * row; only subscribers get a channel.
   */
  subscribers?: readonly string[] | null;
  summary: string;
  tenantId: string;
}

export interface ResolveNotificationsInput {
  outcome: NotificationResolveOutcome;
  subjectId: string;
  subjectType: string;
  tenantId: string;
}

export interface NotificationsServiceOptions {
  db: NotificationsDbSource;
  /**
   * Delay before an unread record is mailed — the email row's `not_before`.
   * The ledger carries the schedule so the channel that later claims the row
   * needs no clock of its own.
   */
  emailDelayMinutes?: number;
  /**
   * Sources whose `update`-class records may be mailed (`"*"` = all).
   * Decision/alert/todo mail regardless of source.
   */
  emailUpdateSources?: string[] | "*";
  /** Called after a record is written; the host turns it into module events. */
  onCreated?: (record: NotificationRecord) => void;
  onResolved?: (records: NotificationRecord[]) => void;
  /**
   * Fills `metadata.actor_label/actor_ref/space_key/space_name` on every
   * emit that lacks them, so producers only need ids (v4 §2.1).
   */
  origin?: OriginLookups;
}

const SUMMARY_MAX = 500;

/**
 * "HH:MM-HH:MM" quiet hours → the instant a delivery may go out. Inside the
 * window the answer is the window's end (today or tomorrow); outside it is
 * `now`. Evaluated in the user's zone when they set one, else UTC.
 */
export function deferForQuietHours(
  now: Date,
  quietHours: string | null,
  timeZone: string | null
): Date {
  if (!quietHours) {
    return now;
  }
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(quietHours.trim());
  if (!match) {
    return now;
  }
  const [, sh, sm, eh, em] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  let localMinutes: number;
  let offsetMs = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: timeZone ?? "UTC",
    }).formatToParts(now);
    const hour =
      Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    localMinutes = hour * 60 + minute;
  } catch {
    localMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  const inWindow =
    start <= end
      ? localMinutes >= start && localMinutes < end
      : localMinutes >= start || localMinutes < end;
  if (!inWindow) {
    return now;
  }
  // Minutes until the window ends, wrapping past midnight when needed.
  const untilEnd = (((end - localMinutes) % 1440) + 1440) % 1440;
  offsetMs = untilEnd * 60_000;
  return new Date(now.getTime() + offsetMs);
}

/** Apply a user's `notifications.<class>.<channel>` preferences. */
export function applyChannelPrefs(
  channels: string[],
  cls: NotificationClass,
  prefs: UserNotificationPrefs
): string[] {
  // Digest is a per-class choice: the delayed, batched email carries the
  // class and nothing rings the phone for it.
  const digest = prefs.channels[`${cls}.email`] === "digest";
  return channels.filter((channel) => {
    const pref = prefs.channels[`${cls}.${channel}`];
    if (pref === "off") {
      return false;
    }
    if (digest) {
      return channel === "email";
    }
    return true;
  });
}

function uniqueUserIds(
  ...lists: (readonly (string | null | undefined)[] | null | undefined)[]
): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const id of list ?? []) {
      if (id && !out.includes(id)) {
        out.push(id);
      }
    }
  }
  return out;
}

/**
 * Who a record is for, when the caller did not say. Place before person:
 * shared work is addressed to the space it happens in (the tenant when it
 * has none), so everyone who may enter sees it and the first to answer
 * wins. A person is the audience only when the subject is theirs — assigned
 * work, a private subject's participants, a task outside any space — or
 * when the record is an FYI about something they started. The owner and
 * initiator of shared work are subscribers (`subscribersFor`), never its
 * audience.
 */
export function resolveNotificationAudiences(
  input: {
    assigneeUserId?: string | null;
    audience?: NotificationAudience | null;
    initiatorUserId?: string | null;
    ownerUserId?: string | null;
    participantUserIds?: readonly string[] | null;
    spaceId?: string | null;
  },
  cls: NotificationClass
): NotificationAudience[] {
  if (input.audience) {
    return [input.audience];
  }
  const user = (userId: string): NotificationAudience => ({
    kind: "user",
    userId,
  });
  const participants = uniqueUserIds(input.participantUserIds);
  const space: NotificationAudience[] = input.spaceId
    ? [{ kind: "space", spaceId: input.spaceId }]
    : [];
  if (cls === "update") {
    // FYI goes to the person it concerns; failing one, to the place.
    for (const userId of [
      input.assigneeUserId,
      input.ownerUserId,
      input.initiatorUserId,
    ]) {
      if (userId) {
        return [user(userId)];
      }
    }
    if (participants.length > 0) {
      return participants.map(user);
    }
    return space.length > 0 ? space : [{ kind: "tenant" }];
  }
  if (cls === "todo" && input.assigneeUserId) {
    // Assigned work IS a person.
    return [user(input.assigneeUserId)];
  }
  if (participants.length > 0) {
    return participants.map(user);
  }
  if (space.length > 0) {
    return space;
  }
  if (input.assigneeUserId) {
    return [user(input.assigneeUserId)];
  }
  return [{ kind: "tenant" }];
}

/**
 * Who gets a channel (push, mail) for a record. A person-addressed row
 * reaches that person; a shared row reaches the people behind it — the ones
 * the old person-first ladder would have addressed — plus explicit
 * subscribers. Streams fan out through their routes instead.
 */
export function subscribersFor(
  audience: NotificationAudience,
  input: Pick<
    EmitNotificationInput,
    "assigneeUserId" | "initiatorUserId" | "ownerUserId" | "subscribers"
  >
): string[] {
  if (audience.kind === "user") {
    return [audience.userId];
  }
  if (audience.kind === "stream") {
    return [];
  }
  return uniqueUserIds(input.subscribers, [
    input.ownerUserId,
    input.initiatorUserId,
    input.assigneeUserId,
  ]);
}

/** Which channels a record fans out to, before any channel's own `accepts`. */
export function channelsFor(
  record: Pick<
    NotificationRecord,
    "audience_kind" | "class" | "priority" | "source"
  >,
  policy: { emailUpdateSources: string[] | "*" }
): string[] {
  // Streams fan out through their routes (N9). Every other audience reaches
  // its subscribers on the class's channels.
  if (record.audience_kind === "stream") {
    return [];
  }
  const defaults = CLASS_CHANNEL_DEFAULTS[record.class];
  if (record.class !== "update") {
    return defaults;
  }
  // FYI records reach a phone only when the producer flagged them as
  // pressing (team-chat mentions), and a mailbox only for opted-in sources.
  const channels: string[] = [];
  if (
    defaults.includes("web_push") &&
    (record.priority === "high" || record.priority === "urgent")
  ) {
    channels.push("web_push");
  }
  if (
    defaults.includes("email") &&
    (policy.emailUpdateSources === "*" ||
      policy.emailUpdateSources.includes(record.source))
  ) {
    channels.push("email");
  }
  return channels;
}

/**
 * Who and where, as labels: an emit that carries only ids gets the origin
 * keys the list reads. Never fails an emit — a lookup miss leaves the ids.
 */
async function enrichOrigin(
  input: EmitNotificationInput,
  lookups: OriginLookups | undefined
): Promise<EmitNotificationInput> {
  if (!lookups) {
    return input;
  }
  const metadata = { ...(input.metadata ?? {}) };
  const actorId = input.actor?.id ?? null;
  const needsActor =
    actorId && input.actor?.kind !== "system" && !metadata.actor_label;
  const needsSpace = input.spaceId && !metadata.space_key;
  if (!(needsActor || needsSpace)) {
    return input;
  }
  try {
    const origin = await resolveOrigin(
      {
        actorId: needsActor ? actorId : null,
        actorKind: input.actor?.kind === "user" ? "user" : "agent",
        spaceId: needsSpace ? (input.spaceId ?? null) : null,
        tenantId: input.tenantId,
      },
      lookups
    );
    return {
      ...input,
      ...(needsActor ? { actor: origin.actor } : {}),
      metadata: { ...origin.metadata, ...metadata },
    };
  } catch {
    return input;
  }
}

export function createNotificationsService(
  options: NotificationsServiceOptions
) {
  const store: NotificationsStore = createNotificationsStore(options.db);
  const kinds = new Map<string, NotificationClass>(
    Object.entries(BUILTIN_NOTIFICATION_KINDS)
  );
  const emailDelayMinutes = options.emailDelayMinutes ?? 5;
  const emailUpdateSources = options.emailUpdateSources ?? ["team-chat"];

  function classOf(kind: string): NotificationClass {
    const cls = kinds.get(kind);
    if (!cls) {
      throw new Error(
        `notifications: kind "${kind}" is not registered — register it with a class before emitting`
      );
    }
    return cls;
  }

  /** One row for one audience: dedupe, coalesce, or insert + deliveries. */
  async function emitOne(
    input: EmitNotificationInput,
    cls: NotificationClass,
    audience: NotificationAudience,
    keys: { coalesceKey: string | null; dedupeKey: string | null }
  ): Promise<NotificationRecord> {
    const summary = input.summary.trim().slice(0, SUMMARY_MAX);
    // A stream must exist: an emit into a typo would otherwise create an
    // inbox nobody is watching.
    const stream =
      audience.kind === "stream"
        ? await store.getStreamByKey({
            key: audience.key,
            tenantId: input.tenantId,
          })
        : null;
    if (audience.kind === "stream" && !stream) {
      throw new Error(
        `notifications: stream "${audience.key}" does not exist in this tenant`
      );
    }

    if (keys.dedupeKey) {
      const existing = await store.findPendingByDedupeKey({
        dedupeKey: keys.dedupeKey,
        tenantId: input.tenantId,
      });
      if (existing) {
        const merged = await store.touchCoalesced({
          id: existing.id,
          summary,
          tenantId: input.tenantId,
        });
        return merged ?? existing;
      }
    }
    if (keys.coalesceKey) {
      // A different ask about the same thing (a routine re-filing the same
      // gated operation each fire): one row, pointed at the newest subject.
      const open = await store.findOpenByCoalesceKey({
        coalesceKey: keys.coalesceKey,
        ...(input.coalesceWindowMs
          ? {
              since: new Date(
                Date.now() - input.coalesceWindowMs
              ).toISOString(),
            }
          : {}),
        tenantId: input.tenantId,
      });
      if (open) {
        const merged = await store.touchCoalesced({
          id: open.id,
          patch: {
            dedupe_key: keys.dedupeKey,
            metadata: input.metadata ?? null,
            payload: input.payload ?? null,
            subject_id: input.subject?.id ?? null,
          },
          summary,
          tenantId: input.tenantId,
        });
        return merged ?? open;
      }
    }

    const record = await store.insert({
      actor_id: input.actor?.id ?? null,
      actor_kind: input.actor?.kind ?? "system",
      audience_id:
        audience.kind === "user"
          ? audience.userId
          : audience.kind === "stream"
            ? audience.key
            : audience.kind === "space"
              ? audience.spaceId
              : null,
      audience_kind: audience.kind,
      class: cls,
      coalesce_key: keys.coalesceKey,
      dedupe_key: keys.dedupeKey,
      kind: input.kind,
      metadata: input.metadata ?? null,
      payload: input.payload ?? null,
      priority: input.priority ?? "medium",
      source: input.source,
      space_id:
        input.spaceId ??
        (audience.kind === "space" ? audience.spaceId : null) ??
        stream?.space_id ??
        null,
      subject_id: input.subject?.id ?? null,
      subject_type: input.subject?.type ?? null,
      summary,
      tenant_id: input.tenantId,
    });

    const now = new Date();
    if (audience.kind === "stream" && stream) {
      // A stream fans out through its routes: each names a channel and a
      // target the transport understands (a messenger thread, a person).
      const routes = await store.listRoutes({
        streamId: stream.id,
        tenantId: input.tenantId,
      });
      const due = routes.filter(
        (route) =>
          route.enabled &&
          PRIORITY_RANK[record.priority] >= PRIORITY_RANK[route.min_priority]
      );
      if (due.length > 0) {
        await store.insertDeliveries(
          due.map((route) => ({
            channel: route.channel,
            not_before: now.toISOString(),
            notification_id: record.id,
            target: route.target,
            tenant_id: input.tenantId,
          }))
        );
      }
    } else {
      const rows: Parameters<typeof store.insertDeliveries>[0] = [];
      for (const userId of subscribersFor(audience, input)) {
        const prefs = await store.readUserPrefs({
          tenantId: input.tenantId,
          userId,
        });
        const channels = applyChannelPrefs(
          channelsFor(record, { emailUpdateSources }),
          cls,
          prefs
        );
        if (channels.length === 0) {
          continue;
        }
        const notBefore = deferForQuietHours(
          now,
          prefs.quietHours,
          prefs.quietHoursTimeZone
        );
        for (const channel of channels) {
          rows.push({
            channel,
            not_before: new Date(
              Math.max(
                notBefore.getTime(),
                channel === "email"
                  ? now.getTime() + emailDelayMinutes * 60_000
                  : now.getTime()
              )
            ).toISOString(),
            notification_id: record.id,
            target: { user_id: userId },
            tenant_id: input.tenantId,
          });
        }
      }
      await store.insertDeliveries(rows);
    }
    // The person looking at the card already: seen for them from the start.
    const preSeen = uniqueUserIds(input.preSeenUserIds).filter(
      (userId) => audience.kind !== "user" || audience.userId === userId
    );
    for (const userId of preSeen) {
      await store.markSeen({
        notificationIds: [record.id],
        tenantId: input.tenantId,
        userId,
      });
    }
    options.onCreated?.(record);
    return record;
  }

  /** Attach this viewer's `seen` to shared rows. */
  async function viewsFor(
    records: NotificationRecord[],
    tenantId: string,
    userId: string | null
  ): Promise<NotificationView[]> {
    const seenIds = userId
      ? await store.listSeenIds({
          notificationIds: records.map((record) => record.id),
          tenantId,
          userId,
        })
      : new Set<string>();
    return records.map((record) => ({
      ...record,
      seen: seenIds.has(record.id),
    }));
  }

  return {
    async count(
      input: AudienceScope & { spaceId: string | null; tenantId: string }
    ) {
      return store.countOpen(input);
    },

    /**
     * Write the record(s). One audience → one row; a private subject's
     * participants → one row each (same subject, so one resolve closes all;
     * the dedupe and coalesce keys carry the person so the rows never merge
     * into each other). Returns the first row.
     */
    async emit(raw: EmitNotificationInput): Promise<NotificationRecord> {
      const input = await enrichOrigin(raw, options.origin);
      const cls = classOf(input.kind);
      const audiences = resolveNotificationAudiences(input, cls);
      const perPerson = audiences.length > 1;
      const records: NotificationRecord[] = [];
      for (const audience of audiences) {
        const suffix =
          perPerson && audience.kind === "user" ? `:${audience.userId}` : "";
        records.push(
          await emitOne(input, cls, audience, {
            coalesceKey: input.coalesceKey
              ? `${input.coalesceKey}${suffix}`
              : null,
            dedupeKey: input.dedupeKey ? `${input.dedupeKey}${suffix}` : null,
          })
        );
      }
      return records[0] as NotificationRecord;
    },

    async list(params: ListNotificationsParams): Promise<NotificationView[]> {
      return viewsFor(await store.list(params), params.tenantId, params.userId);
    },

    /**
     * A person cleared an alert or an FYI. A decision is answered, not
     * cleared: dismissing it would hide an open gate while the agent behind
     * it stays blocked, so the answer is `decide_instead`.
     */
    async dismiss(input: {
      id: string;
      tenantId: string;
    }): Promise<"ok" | "not_found" | "decide_instead"> {
      const record = await store.get(input);
      if (!record) {
        return "not_found";
      }
      if (record.class === "decision") {
        return "decide_instead";
      }
      return (await store.setStatus({ ...input, status: "dismissed" }))
        ? "ok"
        : "not_found";
    },

    /** This person looked at the row. The row itself does not change. */
    async markSeen(input: {
      id: string;
      tenantId: string;
      userId: string;
    }): Promise<boolean> {
      const record = await store.get(input);
      if (!record) {
        return false;
      }
      await store.markSeen({
        notificationIds: [record.id],
        tenantId: input.tenantId,
        userId: input.userId,
      });
      return true;
    },

    async markAllSeen(
      input: AudienceScope & { tenantId: string }
    ): Promise<number> {
      if (!input.userId) {
        return 0;
      }
      const open = await store.list({
        ...input,
        limit: 200,
        status: "open",
        tenantId: input.tenantId,
      });
      // A decision is answered, not read: "seen" would hide an open gate
      // while the agent behind it stays blocked. Those rows resolve when
      // the request is decided (or expire in the sweep).
      const ids = open
        .filter((record) => record.class !== "decision")
        .map((record) => record.id);
      await store.markSeen({
        notificationIds: ids,
        tenantId: input.tenantId,
        userId: input.userId,
      });
      return ids.length;
    },

    /**
     * Read-sync from a producing surface: this person's view of the open
     * records a surface knows they consumed there (a chat read cursor moving
     * past the message) becomes seen.
     */
    async markSeenWhere(
      input: AudienceScope & {
        predicate: (record: NotificationRecord) => boolean;
        tenantId: string;
        userId: string;
      }
    ): Promise<number> {
      const open = await store.list({
        ...input,
        limit: 200,
        status: "open",
        tenantId: input.tenantId,
      });
      const ids = open.filter(input.predicate).map((record) => record.id);
      await store.markSeen({
        notificationIds: ids,
        tenantId: input.tenantId,
        userId: input.userId,
      });
      return ids.length;
    },

    streams: {
      create: store.createStream,
      delete: store.deleteStream,
      get: store.getStream,
      getByKey: store.getStreamByKey,
      list: store.listStreams,
      listRoutes: store.listRoutes,
      replaceRoutes: store.replaceRoutes,
      update: store.updateStream,
    },

    registerKinds(entries: Record<string, NotificationClass>): void {
      for (const [kind, cls] of Object.entries(entries)) {
        kinds.set(kind, cls);
      }
    },

    /**
     * The thing a record points at moved on: every open record about it is
     * resolved — for everyone, whoever answered. `completed` also closes
     * prior `alert`s about the same subject (a retry that succeeded).
     */
    async resolve(input: ResolveNotificationsInput): Promise<number> {
      const open = await store.listOpenBySubject({
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        tenantId: input.tenantId,
      });
      const resolved: NotificationRecord[] = [];
      for (const record of open) {
        if (record.class === "update") {
          continue;
        }
        if (record.class === "alert" && input.outcome !== "completed") {
          continue;
        }
        if (
          await store.setStatus({
            id: record.id,
            metadata: {
              ...(record.metadata ?? {}),
              resolved_reason: input.outcome,
            },
            status: "resolved",
            tenantId: input.tenantId,
          })
        ) {
          resolved.push(record);
        }
      }
      if (resolved.length > 0) {
        options.onResolved?.(resolved);
      }
      return resolved.length;
    },

    store,
  };
}

export type NotificationsService = ReturnType<
  typeof createNotificationsService
>;
