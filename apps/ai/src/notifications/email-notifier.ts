// Email channel on the platform inbox notification fan-out.
//
// Source-agnostic: any producer that writes a per-user inbox record via
// `emitInboxNotification({ source, ... })` (team-chat, agents, tasks,
// heartbeats, …) can be mailed. Which sources actually get email is an
// operator opt-in — the allowlist `ENGENTY_EMAIL_NOTIFICATION_SOURCES`
// (comma-separated, `*` = all). Default is `team-chat` so existing installs
// behave exactly as before phase N4's generalization.
//
// Semantics: "still unread after X minutes" — a periodic scan picks pending
// inbox records older than the delay and mails them through the TENANT'S OWN
// email connection (decision 2026-07-20: connector, not a platform SMTP env).
// v1 sends via the Gmail connector's `gmail_send_message` gateway op, riding
// the service JWT like every other background invoker — the connections
// policy applies, so the tenant's Gmail connection must be set to autonomous
// "full" with `send_message` on "Allow".
//
// Read-sync integration for free: reading the source flips records to `seen`,
// and this scan only mails `pending` records — a notification read anywhere
// in time never emails.
//
// The scan runs on the Mastra notifications table directly (pg): records are
// partitioned into per-user threads (`inbox:{tenant}:{user}`), and the store
// API has no cross-thread query. The scan is CROSS-TENANT; sending is not —
// records are grouped by the tenant in their thread id and each tenant's
// batch rides a service token minted for that tenant (and that tenant's own
// Gmail connection). A tenant the credential cannot serve is left pending,
// not failed.

import { createLogger } from "@engenty/telemetry";
import { Pool } from "pg";
import { resolveRunSnapshotConnectionString } from "../ai/mastra-storage.js";
import type { SchedulerOperationInvoker } from "../scheduler/service-invoker.js";

const logger = createLogger({ name: "email-notifier" });

const SCAN_INTERVAL_MS = 60_000;
const BATCH_LIMIT = 20;

// The notifier was generalized out of team-chat and its env names went with it.
// The old `ENGENTY_TEAM_CHAT_EMAIL_*` names were honored as a fallback until
// 2026-08-04; no deployment set them, so there is one name per setting now.
export function isEmailNotifierEnabled(): boolean {
  return process.env.ENGENTY_EMAIL_NOTIFICATIONS_ENABLED !== "false";
}

function delayMinutes(): number {
  const parsed = Number(process.env.ENGENTY_EMAIL_NOTIFICATION_DELAY_MINUTES);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
}

/**
 * Sources opted into email. `"*"` means all sources; otherwise a concrete
 * allowlist. Default `["team-chat"]` preserves pre-generalization behavior.
 */
export function emailSources(): string[] | "*" {
  const raw = process.env.ENGENTY_EMAIL_NOTIFICATION_SOURCES?.trim();
  if (!raw) {
    return ["team-chat"];
  }
  if (raw === "*") {
    return "*";
  }
  const list = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length > 0 ? list : ["team-chat"];
}

export interface DueNotification {
  createdAt: string;
  id: string;
  payload: Record<string, unknown> | null;
  source: string;
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
    ...(link ? [`Open in Engenty: ${link}`, ""] : []),
    "You're receiving this because it was still unread in Engenty.",
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
  /** Tenant-scoped module-operation invoker — one per tenant in the batch. */
  invokerFor(tenantId: string): SchedulerOperationInvoker;
  listDue(
    delayMin: number,
    sources: string[] | "*"
  ): Promise<DueNotification[]>;
  lookupUserEmail(userId: string): Promise<string | null>;
  markEmailed(id: string, threadId: string, sent: boolean): Promise<void>;
}

export async function runEmailNotifierOnce(
  deps: EmailNotifierDeps
): Promise<{ failed: number; sent: number; skipped: number }> {
  const summary = { failed: 0, sent: 0, skipped: 0 };
  const due = await deps.listDue(delayMinutes(), emailSources());
  if (due.length === 0) {
    return summary;
  }
  // Group by the tenant named in the thread id: the pg scan is cross-tenant,
  // and each tenant's batch must ride a token minted for THAT tenant.
  const byTenant = new Map<
    string,
    { record: DueNotification; userId: string }[]
  >();
  for (const record of due) {
    const target = parseInboxThreadId(record.threadId);
    if (!target) {
      summary.skipped += 1;
      continue; // team-thread record / foreign shape
    }
    const bucket = byTenant.get(target.tenantId) ?? [];
    bucket.push({ record, userId: target.userId });
    byTenant.set(target.tenantId, bucket);
  }
  for (const [tenantId, records] of byTenant) {
    const invoke = deps.invokerFor(tenantId);
    // One accounts probe per tenant per run: without a Gmail connection —
    // or without a mintable scope for this tenant — the bucket stays pending
    // (quiet no-op) instead of a per-record error drumbeat.
    const accounts = (await invoke("connections_list_accounts", {
      connector_id: "google-gmail",
    }).catch(() => ({ accounts: [] }))) as {
      accounts?: { connection_id: string }[];
    };
    if (!accounts.accounts?.length) {
      logger.debug("email notifier idle: no google-gmail connection", {
        tenantId,
      });
      continue;
    }
    for (const { record, userId } of records) {
      try {
        const email = await deps.lookupUserEmail(userId);
        if (!email) {
          await deps.markEmailed(record.id, record.threadId, false);
          summary.skipped += 1;
          continue;
        }
        const message = composeNotificationEmail(
          record,
          process.env.ENGENTY_UI_BASE_URL
        );
        await invoke("gmail_send_message", {
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
          tenantId,
        });
      }
    }
  }
  if (summary.sent > 0 || summary.failed > 0) {
    logger.info("notification emails processed", summary);
  }
  return summary;
}

/** Production deps: pg scan on ai.mastra_notifications + core.users lookup. */
function createPgDeps(
  invokerFor: (tenantId: string) => SchedulerOperationInvoker
): EmailNotifierDeps | null {
  const connectionString = resolveRunSnapshotConnectionString();
  if (!connectionString) {
    return null;
  }
  const pool = new Pool({ connectionString, max: 2 });
  return {
    invokerFor,
    async listDue(delayMin, sources) {
      // Wildcard → no source filter; otherwise restrict to the allowlist.
      const wildcard = sources === "*";
      const params: unknown[] = [delayMin];
      let sourceClause = "";
      if (!wildcard) {
        params.push(sources);
        sourceClause = `and source = any($${params.length}::text[])`;
      }
      const result = await pool.query(
        `select id, "threadId", source, summary, payload, "createdAt"
           from ai.mastra_notifications
          where status = 'pending'
            ${sourceClause}
            and "createdAt" < now() - ($1 * interval '1 minute')
            and (metadata ->> 'email_sent') is null
            and "threadId" like 'inbox:%:%'
          order by "createdAt" asc
          limit ${BATCH_LIMIT}`,
        params
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
  };
}

export function startEmailNotifier(options: {
  invokerFor: (tenantId: string) => SchedulerOperationInvoker;
}): () => void {
  if (!isEmailNotifierEnabled()) {
    logger.info(
      "email notifier disabled (ENGENTY_EMAIL_NOTIFICATIONS_ENABLED)"
    );
    return () => {
      // nothing to stop
    };
  }
  const deps = createPgDeps(options.invokerFor);
  if (!deps) {
    logger.warn("email notifier not started (no SUPABASE_DB_URL)");
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
  const sources = emailSources();
  logger.info("email notifier started", {
    delayMinutes: delayMinutes(),
    scanIntervalMs: SCAN_INTERVAL_MS,
    sources: sources === "*" ? "*" : sources.join(","),
  });
  return () => clearInterval(timer);
}
