// Email channel on the N1 notification fan-out (team-chat phase N4).
//
// Semantics: "still unread after X minutes" — a periodic scan picks pending
// team-chat inbox records older than the delay and mails them through the
// TENANT'S OWN email connection (decision 2026-07-20: connector, not a
// platform SMTP env). v1 sends via the Gmail connector's `gmail_send_message`
// gateway op, riding the service JWT like every other background invoker —
// the connections policy applies, so the tenant's Gmail connection must be
// set to autonomous "full" with `send_message` on "Allow".
//
// Read-sync integration for free: N1 flips records to `seen` when the member
// reads the conversation, and this scan only mails `pending` records — a
// message read anywhere in time never emails.
//
// The scan runs on the Mastra notifications table directly (pg): records are
// partitioned into per-user threads (`inbox:{tenant}:{user}`), and the store
// API has no cross-thread query. The service JWT is tenant-bound, so records
// of other tenants are skipped (same platform boundary as inbox-sync and the
// mention consumer; satellites run their own service JWT).

import { createLogger } from "@engenty/telemetry";
import { Pool } from "pg";
import { resolveRunSnapshotConnectionString } from "../ai/mastra-storage.js";
import type { SchedulerOperationInvoker } from "../scheduler/service-invoker.js";

const logger = createLogger({ name: "team-chat-email-notifier" });

const SCAN_INTERVAL_MS = 60_000;
const BATCH_LIMIT = 20;

export function isEmailNotifierEnabled(): boolean {
  return process.env.ENGENTY_TEAM_CHAT_EMAIL_NOTIFICATIONS_ENABLED !== "false";
}

function delayMinutes(): number {
  const parsed = Number(process.env.ENGENTY_TEAM_CHAT_EMAIL_DELAY_MINUTES);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
}

export interface DueNotification {
  createdAt: string;
  id: string;
  payload: Record<string, unknown> | null;
  summary: string;
  threadId: string;
}

/** `inbox:{tenant}:{user}` → ids; null for the team thread / foreign shapes. */
export function parseInboxThreadId(
  threadId: string
): { tenantId: string; userId: string } | null {
  const parts = threadId.split(":");
  return parts.length === 3 && parts[0] === "inbox" && parts[1] && parts[2]
    ? { tenantId: parts[1], userId: parts[2] }
    : null;
}

/** Subject + plain-text body for one due record. */
export function composeNotificationEmail(
  record: Pick<DueNotification, "payload" | "summary">,
  uiBaseUrl: string | undefined
): { body_text: string; subject: string } {
  const payload = record.payload ?? {};
  const label =
    typeof payload.conversation_label === "string"
      ? payload.conversation_label
      : null;
  const preview =
    typeof payload.text_preview === "string" && payload.text_preview
      ? payload.text_preview
      : record.summary;
  const route = typeof payload.route === "string" ? payload.route : null;
  const link =
    route && uiBaseUrl ? `${uiBaseUrl.replace(/\/$/, "")}${route}` : null;
  const lines = [
    preview,
    "",
    ...(link ? [`Open the conversation: ${link}`, ""] : []),
    "You're receiving this because the message was still unread in Engenty.",
  ];
  return {
    body_text: lines.join("\n"),
    subject: label
      ? `[${label}] ${record.summary}`.slice(0, 140)
      : record.summary.slice(0, 140),
  };
}

/** Injectable seams so the loop is testable without pg/core. */
export interface EmailNotifierDeps {
  invoke: SchedulerOperationInvoker;
  listDue(delayMin: number): Promise<DueNotification[]>;
  lookupUserEmail(userId: string): Promise<string | null>;
  markEmailed(id: string, threadId: string, sent: boolean): Promise<void>;
  serviceTenantId(): Promise<string | null>;
}

export async function runEmailNotifierOnce(
  deps: EmailNotifierDeps
): Promise<{ failed: number; sent: number; skipped: number }> {
  const summary = { failed: 0, sent: 0, skipped: 0 };
  const due = await deps.listDue(delayMinutes());
  if (due.length === 0) {
    return summary;
  }
  const tenantId = await deps.serviceTenantId();
  if (!tenantId) {
    return summary; // no service scope — nothing we can send as
  }
  // One accounts probe per run: without a Gmail connection the whole run is
  // a quiet no-op instead of a per-record error drumbeat.
  const accounts = (await deps
    .invoke("connections_list_accounts", { connector_id: "google-gmail" })
    .catch(() => ({ accounts: [] }))) as {
    accounts?: { connection_id: string }[];
  };
  if (!accounts.accounts?.length) {
    logger.debug("email notifier idle: no google-gmail connection");
    return summary;
  }
  for (const record of due) {
    const target = parseInboxThreadId(record.threadId);
    if (!target || target.tenantId !== tenantId) {
      summary.skipped += 1;
      continue; // team-thread record or foreign tenant (other service JWT)
    }
    try {
      const email = await deps.lookupUserEmail(target.userId);
      if (!email) {
        await deps.markEmailed(record.id, record.threadId, false);
        summary.skipped += 1;
        continue;
      }
      const message = composeNotificationEmail(
        record,
        process.env.ENGENTY_UI_BASE_URL
      );
      await deps.invoke("gmail_send_message", {
        body_text: message.body_text,
        subject: message.subject,
        to: [email],
      });
      await deps.markEmailed(record.id, record.threadId, true);
      summary.sent += 1;
    } catch (error) {
      // Terminal for this record: policy denials and approval parking would
      // otherwise retry every minute forever. New notifications get a fresh
      // chance once the connection is configured.
      await deps
        .markEmailed(record.id, record.threadId, false)
        .catch(() => undefined);
      summary.failed += 1;
      logger.warn("notification email failed", {
        id: record.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (summary.sent > 0 || summary.failed > 0) {
    logger.info("notification emails processed", summary);
  }
  return summary;
}

/** Production deps: pg scan on ai.mastra_notifications + core.users lookup. */
function createPgDeps(
  invoke: SchedulerOperationInvoker,
  resolveTenantId: () => Promise<string | null>
): EmailNotifierDeps | null {
  const connectionString = resolveRunSnapshotConnectionString();
  if (!connectionString) {
    return null;
  }
  const pool = new Pool({ connectionString, max: 2 });
  return {
    invoke,
    async listDue(delayMin) {
      const result = await pool.query(
        `select id, "threadId", summary, payload, "createdAt"
           from ai.mastra_notifications
          where status = 'pending'
            and source = 'team-chat'
            and "createdAt" < now() - ($1 * interval '1 minute')
            and (metadata ->> 'email_sent') is null
            and "threadId" like 'inbox:%:%'
          order by "createdAt" asc
          limit ${BATCH_LIMIT}`,
        [delayMin]
      );
      return result.rows as DueNotification[];
    },
    async lookupUserEmail(userId) {
      const result = await pool.query(
        "select email from core.users where id = $1",
        [userId]
      );
      return (result.rows[0]?.email as string | undefined) ?? null;
    },
    async markEmailed(id, threadId, sent) {
      await pool.query(
        `update ai.mastra_notifications
            set metadata = coalesce(metadata, '{}'::jsonb)
                || jsonb_build_object('email_sent', $3::boolean),
                "updatedAt" = now()
          where id = $1 and "threadId" = $2`,
        [id, threadId, sent]
      );
    },
    serviceTenantId: resolveTenantId,
  };
}

export function startEmailNotifier(options: {
  invoke: SchedulerOperationInvoker;
  resolveTenantId: () => Promise<string | null>;
}): () => void {
  if (!isEmailNotifierEnabled()) {
    logger.info(
      "team-chat email notifier disabled (ENGENTY_TEAM_CHAT_EMAIL_NOTIFICATIONS_ENABLED)"
    );
    return () => {
      // nothing to stop
    };
  }
  const deps = createPgDeps(options.invoke, options.resolveTenantId);
  if (!deps) {
    logger.warn("team-chat email notifier not started (no SUPABASE_DB_URL)");
    return () => {
      // nothing to stop
    };
  }
  const timer = setInterval(() => {
    runEmailNotifierOnce(deps).catch((error) =>
      logger.warn("email notifier run failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }, SCAN_INTERVAL_MS);
  timer.unref?.();
  logger.info("team-chat email notifier started", {
    delayMinutes: delayMinutes(),
    scanIntervalMs: SCAN_INTERVAL_MS,
  });
  return () => clearInterval(timer);
}
