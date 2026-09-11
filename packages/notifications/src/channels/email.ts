// Email channel: "still unread after the delay". The ledger row's
// `not_before` carries the delay and the loop skips rows whose record is no
// longer pending, so a notification read anywhere in time never mails.
//
// Sending goes through the TENANT'S OWN mail connection (the Gmail connector's
// `gmail_send_message` operation), never a platform SMTP — the host supplies
// an invoker that rides a service token for that tenant.
import { createLogger } from "@engenty/telemetry";
import type { NotificationChannel, NotificationRecord } from "../contracts.js";

const logger = createLogger({ name: "notifications-email" });

export type OperationInvoker = (
  operationId: string,
  input: Record<string, unknown>
) => Promise<unknown>;

export interface EmailChannelDeps {
  /** Tenant-scoped module-operation invoker. */
  invokerFor(tenantId: string): OperationInvoker;
  lookupUserEmail(input: {
    tenantId: string;
    userId: string;
  }): Promise<string | null>;
  /** Base URL for the "Open in Engenty" link; absent → no link. */
  uiBaseUrl?: string | undefined;
}

/** Subject + plain-text body for one record. */
export function composeNotificationEmail(
  record: Pick<NotificationRecord, "payload" | "summary">,
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

export function createEmailChannel(
  deps: EmailChannelDeps
): NotificationChannel {
  // One accounts probe per tenant per loop pass would be ideal; per record is
  // acceptable at inbox volumes and keeps the channel stateless.
  return {
    accepts: (_record, target) => typeof target.user_id === "string",
    async deliver(record, target, ctx) {
      const invoke = deps.invokerFor(ctx.tenantId);
      const accounts = (await invoke("connections_list_accounts", {
        connector_id: "google-gmail",
      }).catch(() => ({ accounts: [] }))) as {
        accounts?: { connection_id: string }[];
      };
      if (!accounts.accounts?.length) {
        // Quiet no-op rather than an error drumbeat: the row fails terminally
        // and the next notification gets a fresh chance once mail is set up.
        throw new Error("no google-gmail connection for this tenant");
      }
      const email = await deps.lookupUserEmail({
        tenantId: ctx.tenantId,
        userId: target.user_id as string,
      });
      if (!email) {
        throw new Error("recipient has no email address");
      }
      const message = composeNotificationEmail(record, deps.uiBaseUrl);
      await invoke("gmail_send_message", {
        body_text: message.body_text,
        subject: message.subject,
        to: [email],
      });
      logger.info("notification emailed", {
        id: record.id,
        tenantId: ctx.tenantId,
      });
    },
    id: "email",
  };
}
