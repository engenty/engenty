// The host: what modules reach through `engenty.server.notifications`, and
// what the loader installs there. One host per process, built once from a
// tenant-locked db source and the plugin events api.
import type {
  NotificationsHostLike,
  PluginEventsApi,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import {
  type ChannelRegistry,
  createChannelRegistry,
} from "./channels/registry.js";
import {
  NOTIFICATIONS_CREATED_EVENT,
  NOTIFICATIONS_RESOLVED_EVENT,
  type NotificationChannel,
  type NotificationClass,
  type NotificationRecord,
} from "./contracts.js";
import type { NotificationsDbSource } from "./dal/store.js";
import type { OriginLookups } from "./origin.js";
import {
  createNotificationsService,
  type EmitNotificationInput,
  type NotificationsService,
  type ResolveNotificationsInput,
} from "./service.js";

const logger = createLogger({ name: "notifications-host" });

export interface NotificationsHost extends NotificationsHostLike {
  channels: ChannelRegistry;
  emit(input: EmitNotificationInput): Promise<NotificationRecord>;
  markSeenWhere(
    input: Parameters<NotificationsService["markSeenWhere"]>[0]
  ): Promise<number>;
  registerChannel(channel: NotificationChannel): () => void;
  registerKinds(entries: Record<string, NotificationClass>): void;
  resolve(input: ResolveNotificationsInput): Promise<number>;
  service: NotificationsService;
}

export interface CreateNotificationsHostOptions {
  db: NotificationsDbSource;
  emailDelayMinutes?: number;
  emailUpdateSources?: string[] | "*";
  events?: PluginEventsApi | null;
  /** Label lookups so every emit carries who/where (v4 §2.1). */
  origin?: OriginLookups;
}

function eventPayload(record: NotificationRecord) {
  return {
    audience_id: record.audience_id,
    audience_kind: record.audience_kind,
    class: record.class,
    id: record.id,
    kind: record.kind,
    source: record.source,
    space_id: record.space_id,
    subject_id: record.subject_id,
    subject_type: record.subject_type,
    tenant_id: record.tenant_id,
  };
}

export function createNotificationsHost(
  options: CreateNotificationsHostOptions
): NotificationsHost {
  const channels = createChannelRegistry();
  const emitEvent = (name: string, record: NotificationRecord) => {
    if (!options.events) {
      return;
    }
    options.events.modules
      .emit(name, eventPayload(record), {
        sourceModuleId: "notifications",
        tenantId: record.tenant_id,
      })
      .catch((error: unknown) => {
        logger.debug("notification event emit failed", {
          message: error instanceof Error ? error.message : String(error),
          name,
        });
      });
  };
  const service = createNotificationsService({
    db: options.db,
    ...(options.emailDelayMinutes === undefined
      ? {}
      : { emailDelayMinutes: options.emailDelayMinutes }),
    ...(options.emailUpdateSources === undefined
      ? {}
      : { emailUpdateSources: options.emailUpdateSources }),
    onCreated: (record) => emitEvent(NOTIFICATIONS_CREATED_EVENT, record),
    ...(options.origin ? { origin: options.origin } : {}),
    onResolved: (records) => {
      for (const record of records) {
        emitEvent(NOTIFICATIONS_RESOLVED_EVENT, record);
      }
    },
  });

  return {
    channels,
    emit: (input) => service.emit(input),
    markSeenWhere: (input) => service.markSeenWhere(input),
    registerChannel: (channel) => channels.register(channel),
    registerKinds: (entries) => service.registerKinds(entries),
    resolve: (input) => service.resolve(input),
    service,
  };
}

/** Env-driven policy the hosts share. */
export function notificationsPolicyFromEnv(): {
  emailDelayMinutes: number;
  emailUpdateSources: string[] | "*";
} {
  const parsed = Number(process.env.ENGENTY_EMAIL_NOTIFICATION_DELAY_MINUTES);
  const emailDelayMinutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
  const raw = process.env.ENGENTY_EMAIL_NOTIFICATION_SOURCES?.trim();
  let emailUpdateSources: string[] | "*" = ["team-chat"];
  if (raw === "*") {
    emailUpdateSources = "*";
  } else if (raw) {
    const list = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (list.length > 0) {
      emailUpdateSources = list;
    }
  }
  return { emailDelayMinutes, emailUpdateSources };
}
