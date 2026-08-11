import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@engenty/ui-core";
import { Reply, SendHorizonal, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { InboxThreadDetail } from "../api.js";
import { ThreadReplyComposer } from "./thread-reply-composer.js";

export type ConversationFooterMode = "ai" | "reply";

/**
 * Sticky footer under the conversation column: switch between asking Copilot
 * about the thread and composing a (local) email reply.
 */
export function ThreadConversationFooter({
  detail,
  mode,
  onAskCopilot,
  onModeChange,
  ownEmails,
  subject,
}: {
  detail: InboxThreadDetail;
  mode: ConversationFooterMode;
  onAskCopilot: (prompt: string) => void;
  onModeChange: (mode: ConversationFooterMode) => void;
  ownEmails: Set<string>;
  subject: string;
}) {
  const { t } = useTranslation("inbox");
  const [ask, setAsk] = useState("");

  useEffect(() => {
    setAsk("");
  }, [detail.thread.id]);

  const submitAsk = () => {
    const action = ask.trim();
    if (!action) {
      return;
    }
    onAskCopilot(
      t("optimized.copilotPrompt", {
        action,
        subject,
      })
    );
    setAsk("");
  };

  return (
    <div className="shrink-0 border-t bg-background px-4 py-3">
      <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Tabs
            onValueChange={(value) =>
              onModeChange(value as ConversationFooterMode)
            }
            value={mode}
          >
            <TabsList className="h-8" variant="segmented">
              <TabsTrigger className="gap-1.5 px-3 text-xs" value="ai">
                <Sparkles className="size-3.5" />
                {t("footer.modeAi")}
              </TabsTrigger>
              <TabsTrigger className="gap-1.5 px-3 text-xs" value="reply">
                <Reply className="size-3.5" />
                {t("footer.modeReply")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {mode === "ai" ? (
          <div className="flex items-end gap-2">
            <Textarea
              className="min-h-[2.5rem] flex-1 resize-none"
              onChange={(event) => setAsk(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitAsk();
                }
              }}
              placeholder={t("footer.askPlaceholder")}
              rows={2}
              value={ask}
            />
            <Button
              disabled={!ask.trim()}
              onClick={submitAsk}
              size="icon"
              title={t("footer.askSubmit")}
              type="button"
            >
              <SendHorizonal className="size-4" />
            </Button>
          </div>
        ) : (
          <ThreadReplyComposer detail={detail} ownEmails={ownEmails} />
        )}
      </div>
    </div>
  );
}
