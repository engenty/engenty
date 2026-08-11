import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ScrollArea,
  Skeleton,
} from "@engenty/ui-core";
import { MailOpen, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { InboxMessage, InboxThreadDetail } from "../api.js";
import { useAutoMarkThreadRead } from "../hooks/use-auto-mark-thread-read.js";
import { INBOX_STATUS_BADGE_VARIANT } from "../lib/inbox-status-badge.js";
import {
  useInboxAccountsQuery,
  useInboxThreadDigestQuery,
  useInboxThreadQuery,
  useRefreshThreadDigestMutation,
} from "../queries.js";
import { EmailMessageBody } from "./email-message-body.js";
import { MessageAttachments } from "./message-attachments.js";
import {
  ThreadDetailHeader,
  type ThreadNavControls,
  type ThreadViewMode,
} from "./thread-detail-header.js";
import { ThreadOptimizedView } from "./thread-optimized-view.js";

const THREAD_VIEW_STORAGE_KEY = "engenty.inbox.thread_view";

/** Conversation is the default; Original is available when someone opts in. */
function readStoredViewMode(): ThreadViewMode {
  try {
    return window.localStorage.getItem(THREAD_VIEW_STORAGE_KEY) === "original"
      ? "original"
      : "optimized";
  } catch {
    return "optimized";
  }
}

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

/** Right pane of the mail client: one thread, as mail or as a conversation. */
export function ThreadDetail({
  nav,
  threadId,
}: {
  nav: ThreadNavControls;
  threadId: string | null;
}) {
  const { t } = useTranslation("inbox");
  const threadQuery = useInboxThreadQuery(threadId);
  const accountsQuery = useInboxAccountsQuery();
  // The digest belongs to the optimized view, but regenerating it is a view
  // action that sits next to the view tabs — so the mutation is owned here and
  // shared, keeping the view's own loading state in step with the button.
  const refresh = useRefreshThreadDigestMutation();
  const digest = useInboxThreadDigestQuery(threadId, false).data;
  const [viewMode, setViewMode] = useState<ThreadViewMode>(readStoredViewMode);
  useAutoMarkThreadRead(threadId, threadQuery.data);
  const accountEmailByConnection = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accountsQuery.data?.accounts ?? []) {
      if (account.external_account) {
        map.set(account.connection_id, account.external_account);
      }
    }
    return map;
  }, [accountsQuery.data]);
  const ownEmails = useMemo(
    () =>
      new Set(
        Array.from(accountEmailByConnection.values()).map((email) =>
          email.toLowerCase()
        )
      ),
    [accountEmailByConnection]
  );

  const selectViewMode = (mode: ThreadViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(THREAD_VIEW_STORAGE_KEY, mode);
    } catch {
      // Storage unavailable (private mode) — the toggle still works in-session.
    }
  };

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
  const detail = threadQuery.data;

  // Only a back-and-forth between people reads as a conversation — a receipt or
  // a CI notification has nobody to talk with, so it gets the mail view alone.
  // The digest's verdict wins when there is one (it saw the whole body); before
  // that, the eager classifier's category on the latest message decides. An
  // unclassified thread has no verdict yet, so it keeps the tab rather than
  // losing the view until classification catches up.
  const category = digest?.category ?? detail?.messages.at(-1)?.ai_category;
  const showConversationTab =
    category === undefined || category === null
      ? true
      : category === "conversation";
  const effectiveViewMode: ThreadViewMode = showConversationTab
    ? viewMode
    : "original";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {threadQuery.isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : detail ? (
        <>
          <ThreadDetailHeader
            detail={detail}
            nav={nav}
            onSelectViewMode={selectViewMode}
            showConversationTab={showConversationTab}
            tabActions={
              effectiveViewMode === "optimized" ? (
                <Button
                  disabled={refresh.isPending}
                  onClick={() =>
                    refresh.mutate({
                      includeSummary: Boolean(digest?.thread),
                      threadId,
                    })
                  }
                  size="icon-sm"
                  title={t("optimized.refresh")}
                  variant="ghost"
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      refresh.isPending && "animate-spin"
                    )}
                  />
                </Button>
              ) : null
            }
            viewMode={effectiveViewMode}
          />
          {/* The optimized view scrolls itself — it needs a real viewport ref
              for the auto-scroll to the newest message and the assistant zone
              pinned below the transcript. */}
          {effectiveViewMode === "optimized" ? (
            <ThreadOptimizedView
              detail={detail}
              ownEmails={ownEmails}
              refresh={refresh}
            />
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <ThreadOriginalView
                accountEmailByConnection={accountEmailByConnection}
                detail={detail}
              />
            </ScrollArea>
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("thread.notFound")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      )}
    </div>
  );
}

/** The classic email rendering: full cards, newest message first. */
function ThreadOriginalView({
  accountEmailByConnection,
  detail,
}: {
  accountEmailByConnection: Map<string, string>;
  detail: InboxThreadDetail;
}) {
  const { t } = useTranslation("inbox");
  return (
    <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-3 p-4">
      {detail.messages.toReversed().map((message) => (
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
  );
}
