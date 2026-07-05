import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@engenty/ui-core";
import { Archive, ArrowLeft, Check, Paperclip } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { InboxMessage, InboxMessageStatus } from "../api.js";
import { EmailMessageBody } from "../components/email-message-body.js";
import {
  useInboxThreadQuery,
  useSetMessageStatusMutation,
} from "../queries.js";

const STATUS_BADGE_VARIANT: Record<
  InboxMessageStatus,
  "default" | "outline" | "secondary"
> = {
  archived: "outline",
  new: "default",
  processed: "secondary",
  triaged: "secondary",
};

export function InboxThreadPage() {
  const { t } = useTranslation("inbox");
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId: string }>();
  const threadQuery = useInboxThreadQuery(threadId ?? null);
  const setStatus = useSetMessageStatusMutation();

  if (threadQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-2 p-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const detail = threadQuery.data;
  if (!detail) {
    return (
      <div className="mx-auto max-w-4xl p-4">
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
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            onClick={() => navigate("/mdl/inbox")}
            size="sm"
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="truncate font-semibold text-lg">
            {detail.thread.subject ?? t("list.noSubject")}
          </h1>
        </div>
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

      <div className="space-y-3">
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
    </div>
  );
}
