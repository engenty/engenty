// Channel registry + the delivery loop.
//
// Channels are registered per process; the loop claims only rows for the
// channels registered here. A row is claimed with a compare-and-swap on the
// ledger, so two processes running the same channel cannot both send.
import { createLogger } from "@engenty/telemetry";
import type { ChannelTarget, NotificationChannel } from "../contracts.js";
import type { NotificationsStore } from "../dal/store.js";

const logger = createLogger({ name: "notifications-delivery" });

const CLAIM_BATCH = 50;
const MAX_ATTEMPTS = 5;

export function createChannelRegistry() {
  const channels = new Map<string, NotificationChannel>();
  return {
    get(id: string): NotificationChannel | undefined {
      return channels.get(id);
    },
    ids(): string[] {
      return [...channels.keys()];
    },
    register(channel: NotificationChannel): () => void {
      if (!channel.id.trim()) {
        throw new Error("notifications: a channel needs an id");
      }
      channels.set(channel.id, channel);
      return () => {
        channels.delete(channel.id);
      };
    },
  };
}

export type ChannelRegistry = ReturnType<typeof createChannelRegistry>;

/**
 * One pass over the due deliveries of one tenant. Exported so a test can drive
 * it without timers.
 */
export async function runDeliveryOnce(input: {
  channels: ChannelRegistry;
  now?: Date;
  store: NotificationsStore;
  tenantId: string;
}): Promise<{ failed: number; sent: number; skipped: number }> {
  const summary = { failed: 0, sent: 0, skipped: 0 };
  const ids = input.channels.ids();
  if (ids.length === 0) {
    return summary;
  }
  const due = await input.store.listDueDeliveries({
    channels: ids,
    limit: CLAIM_BATCH,
    now: (input.now ?? new Date()).toISOString(),
    tenantId: input.tenantId,
  });
  if (due.length === 0) {
    return summary;
  }
  const records = await input.store.getMany({
    ids: [...new Set(due.map((row) => row.notification_id))],
    tenantId: input.tenantId,
  });
  const byId = new Map(records.map((record) => [record.id, record]));

  for (const delivery of due) {
    const claimed = await input.store.claimDelivery({
      id: delivery.id,
      tenantId: input.tenantId,
    });
    if (!claimed) {
      continue; // another process got it
    }
    const record = byId.get(delivery.notification_id);
    const channel = input.channels.get(delivery.channel);
    // The record was dismissed or resolved before the channel got to it, or
    // this person already looked at it — sending now would announce
    // something that is over for them.
    const attempts = claimed.attempts + 1;
    const target = delivery.target as ChannelTarget;
    const seenByTarget =
      record && target.user_id
        ? (
            await input.store.listSeenIds({
              notificationIds: [record.id],
              tenantId: input.tenantId,
              userId: target.user_id,
            })
          ).has(record.id)
        : false;
    if (!(record && channel) || record.status !== "pending" || seenByTarget) {
      await input.store.finishDelivery({
        attempts,
        id: delivery.id,
        status: "skipped",
        tenantId: input.tenantId,
      });
      summary.skipped += 1;
      continue;
    }
    if (channel.accepts && !channel.accepts(record, target)) {
      await input.store.finishDelivery({
        attempts,
        id: delivery.id,
        status: "skipped",
        tenantId: input.tenantId,
      });
      summary.skipped += 1;
      continue;
    }
    try {
      await channel.deliver(record, target, { tenantId: input.tenantId });
      await input.store.finishDelivery({
        attempts,
        id: delivery.id,
        status: "sent",
        tenantId: input.tenantId,
      });
      summary.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A deterministic failure (no connection, policy denial) must not retry
      // every tick forever; after the cap the row is terminal.
      const terminal = attempts >= MAX_ATTEMPTS;
      await input.store.finishDelivery({
        attempts,
        error: message,
        id: delivery.id,
        status: terminal ? "failed" : "pending",
        tenantId: input.tenantId,
      });
      summary.failed += 1;
      logger.warn("notification delivery failed", {
        channel: delivery.channel,
        message,
        notificationId: delivery.notification_id,
      });
    }
  }
  if (summary.sent > 0 || summary.failed > 0) {
    logger.info("notification deliveries processed", {
      ...summary,
      tenantId: input.tenantId,
    });
  }
  return summary;
}

export interface StartDeliveryLoopOptions {
  channels: ChannelRegistry;
  intervalMs?: number;
  /** The tenants this process delivers for. */
  listTenantIds: () => Promise<string[]>;
  store: NotificationsStore;
}

/** Periodic delivery for every tenant; returns the stop function. */
export function startDeliveryLoop(
  options: StartDeliveryLoopOptions
): () => void {
  const intervalMs = options.intervalMs ?? 30_000;
  let running = false;
  const tick = async () => {
    if (running || options.channels.ids().length === 0) {
      return;
    }
    running = true;
    try {
      const tenantIds = await options.listTenantIds();
      for (const tenantId of tenantIds) {
        await runDeliveryOnce({
          channels: options.channels,
          store: options.store,
          tenantId,
        }).catch((error) => {
          logger.warn("delivery tick failed", {
            message: error instanceof Error ? error.message : String(error),
            tenantId,
          });
        });
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();
  logger.info("notification delivery loop started", {
    channels: options.channels.ids(),
    intervalMs,
  });
  return () => clearInterval(timer);
}
