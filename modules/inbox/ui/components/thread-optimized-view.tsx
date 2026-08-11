import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@engenty/ui-core";
import { Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { InboxThreadDetail } from "../api.js";
import { useAskCopilot } from "../hooks/use-ask-copilot.js";
import type { useRefreshThreadDigestMutation } from "../queries.js";
import {
  useInboxThreadDigestQuery,
  useThreadSummaryMutation,
} from "../queries.js";
import { DigestMessageRow } from "./digest-message-row.js";
import { ThreadAssistantZone } from "./thread-assistant-zone.js";
import {
  type ConversationFooterMode,
  ThreadConversationFooter,
} from "./thread-conversation-footer.js";

/**
 * Conversation tab: chat transcript (Copilot-width column), inline AI chips,
 * sticky AI | Reply footer.
 */
export function ThreadOptimizedView({
  detail,
  ownEmails,
  refresh,
}: {
  detail: InboxThreadDetail;
  ownEmails: Set<string>;
  /** Owned by `ThreadDetail` — its button lives next to the view tabs. */
  refresh: ReturnType<typeof useRefreshThreadDigestMutation>;
}) {
  const { t } = useTranslation("inbox");
  const digestQuery = useInboxThreadDigestQuery(detail.thread.id);
  const summarize = useThreadSummaryMutation();
  const askCopilot = useAskCopilot();
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [footerMode, setFooterMode] = useState<ConversationFooterMode>("ai");
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadId = detail.thread.id;
  const subject = detail.thread.subject ?? t("list.noSubject");

  const digestByMessageId = useMemo(
    () =>
      new Map(
        (digestQuery.data?.messages ?? []).map((digest) => [
          digest.message_id,
          digest,
        ])
      ),
    [digestQuery.data]
  );

  const converting = digestQuery.isLoading || refresh.isPending;
  const digest = digestQuery.data;

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [threadId, converting, digest?.messages.length]);

  useEffect(() => {
    setSummaryOpen(true);
    setFooterMode("ai");
  }, [threadId]);

  const handOffToCopilot = (prompt: string) => {
    setFooterMode("ai");
    askCopilot(prompt);
    toast.success(t("toasts.copilotOpened"));
  };

  if (digestQuery.isError && !digest) {
    return (
      <div className="p-4">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("optimized.failedTitle")}</EmptyTitle>
            <EmptyDescription className="break-words">
              {String(digestQuery.error)}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            onClick={() => digestQuery.refetch()}
            size="sm"
            variant="outline"
          >
            {t("errors.retry")}
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {converting ? (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b bg-muted/40 px-4 py-2 text-muted-foreground text-sm">
          <div className="mx-auto flex w-full max-w-[42rem] items-center gap-2">
            <Sparkles className="size-4 animate-pulse" />
            {t("optimized.generating")}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-4 p-4">
          {detail.messages.map((message) => (
            <DigestMessageRow
              digest={digestByMessageId.get(message.id)}
              key={message.id}
              message={message}
              own={
                message.from_email
                  ? ownEmails.has(message.from_email.toLowerCase())
                  : false
              }
              pending={converting && !digestByMessageId.has(message.id)}
            />
          ))}

          {digest ? (
            <ThreadAssistantZone
              category={digest.category}
              onAsk={(action) =>
                handOffToCopilot(
                  t("optimized.copilotPrompt", {
                    action,
                    subject,
                  })
                )
              }
              onCollapse={() => setSummaryOpen((open) => !open)}
              onSummarize={() => {
                setSummaryOpen(true);
                summarize.mutate(threadId);
              }}
              open={summaryOpen}
              summarizing={summarize.isPending}
              summary={digest.thread}
            />
          ) : converting ? (
            <Skeleton className="h-9 w-48" />
          ) : null}
        </div>
      </div>

      <ThreadConversationFooter
        detail={detail}
        mode={footerMode}
        onAskCopilot={handOffToCopilot}
        onModeChange={setFooterMode}
        ownEmails={ownEmails}
        subject={subject}
      />
    </div>
  );
}
