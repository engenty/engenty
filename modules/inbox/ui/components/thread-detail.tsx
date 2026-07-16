import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ScrollArea,
  Skeleton,
} from "@engenty/ui-core";
import { MailOpen } from "lucide-react";
import { useMemo } from "react";
import type { InboxMessage } from "../api.js";
import { INBOX_STATUS_BADGE_VARIANT } from "../lib/inbox-status-badge.js";
import { useInboxAccountsQuery, useInboxThreadQuery } from "../queries.js";
import { EmailMessageBody } from "./email-message-body.js";
import { MessageAttachments } from "./message-attachments.js";

function formatRecipientLine(
  message: InboxMessage,
  accountEmail: string | undefined
): string | null {
  const recipients = message.to_emails.filter(
    (email) => email.trim().length > 0
  );
  if (recipients.length > 0) {
    return recipients.join(", ");
  }
  return accountEmail?.trim() || null;
}

/** Right pane of the mail client: one conversation, newest message last. */
export function ThreadDetail({ threadId }: { threadId: string | null }) {
  const { t } = useTranslation("inbox");
  const threadQuery = useInboxThreadQuery(threadId);
  const accountsQuery = useInboxAccountsQuery();
  const accountEmailByConnection = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accountsQuery.data?.accounts ?? []) {
      if (account.external_account) {
        map.set(account.connection_id, account.external_account);
      }
    }
    return map;
  }, [accountsQuery.data]);

  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>
          <EmptyHeader>
            <MailOpen className="mx-auto size-8 text-muted-foreground" />
            <EmptyTitle>{t("detail.placeholderTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("detail.placeholderDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  if (threadQuery.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const detail = threadQuery.data;
  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("thread.notFound")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {detail.messages.map((message) => (
            <Card className="flex flex-col gap-2 p-4" key={message.id}>
              <div className="flex shrink-0 items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-sm">
                    {message.from_name ?? message.from_email ?? "—"}
                  </span>
                  {message.from_name && message.from_email ? (
                    <span className="ml-1 text-muted-foreground text-xs">
                      {message.from_email}
                    </span>
                  ) : null}
                  <div className="truncate text-muted-foreground text-xs">
                    {(() => {
                      const to = formatRecipientLine(
                        message,
                        accountEmailByConnection.get(message.connection_id)
                      );
                      if (!to) {
                        return null;
                      }
                      return (
                        <>
                          {t("thread.to", { to })}
                          {message.cc_emails.length > 0
                            ? ` · ${t("thread.cc", { cc: message.cc_emails.join(", ") })}`
                            : ""}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={INBOX_STATUS_BADGE_VARIANT[message.status]}>
                    {t(`lanes.${message.status}`)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {message.received_at
                      ? new Date(message.received_at).toLocaleString()
                      : ""}
                  </span>
                </div>
              </div>
              <EmailMessageBody message={message} />
              <MessageAttachments
                attachments={message.attachments_json}
                messageId={message.id}
              />
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
