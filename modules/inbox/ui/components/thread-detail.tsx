import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ScrollArea,
  Skeleton,
} from "@engenty/ui-core";
import { Archive, Check, MailOpen, Paperclip } from "lucide-react";
import { toast } from "sonner";
import type { InboxMessage, InboxMessageStatus } from "../api.js";
import {
  useInboxThreadQuery,
  useSetMessageStatusMutation,
} from "../queries.js";
import { EmailMessageBody } from "./email-message-body.js";

const STATUS_BADGE_VARIANT: Record<
  InboxMessageStatus,
  "default" | "outline" | "secondary"
> = {
  archived: "outline",
  new: "default",
  processed: "secondary",
  triaged: "secondary",
};

/** Right pane of the mail client: one conversation, newest message last. */
export function ThreadDetail({ threadId }: { threadId: string | null }) {
  const { t } = useTranslation("inbox");
  const threadQuery = useInboxThreadQuery(threadId);
  const setStatus = useSetMessageStatusMutation();

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

  const applyStatus = (messages: InboxMessage[], status: InboxMessageStatus) =>
    setStatus.mutate(
      { ids: messages.map((message) => message.id), status },
      {
        onError: (error) =>
          toast.error(t("toasts.statusFailed", { error: String(error) })),
        onSuccess: () => toast.success(t(`toasts.status.${status}`)),
      }
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="min-w-0 truncate font-semibold text-base">
          {detail.thread.subject ?? t("list.noSubject")}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            disabled={setStatus.isPending}
            onClick={() => applyStatus(detail.messages, "processed")}
            size="sm"
            variant="outline"
          >
            <Check className="size-4" /> {t("actions.markProcessed")}
          </Button>
          <Button
            disabled={setStatus.isPending}
            onClick={() => applyStatus(detail.messages, "archived")}
            size="sm"
            variant="outline"
          >
            <Archive className="size-4" /> {t("actions.archive")}
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {detail.messages.map((message) => (
            <Card className="space-y-2 p-4" key={message.id}>
              <div className="flex items-baseline justify-between gap-2">
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
                    {t("thread.to", { to: message.to_emails.join(", ") })}
                    {message.cc_emails.length > 0
                      ? ` · ${t("thread.cc", { cc: message.cc_emails.join(", ") })}`
                      : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_BADGE_VARIANT[message.status]}>
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
              {message.attachments_json.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t pt-2">
                  {message.attachments_json.map((attachment, index) => (
                    <Badge
                      key={attachment.attachment_id ?? index}
                      variant="outline"
                    >
                      <Paperclip className="mr-1 size-3" />
                      {attachment.filename ?? t("thread.attachment")}
                      {attachment.size
                        ? ` (${Math.round(attachment.size / 1024)} kB)`
                        : ""}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
