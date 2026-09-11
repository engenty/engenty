// Human review actions for a task parked at `in_review`.
//
// A finished agent run leaves the task at `in_review` with its result as a
// comment — but until now the only way to act on that was the generic status
// dropdown, with feedback as a separate free-text comment nobody ties to the
// decision. This card makes the two real outcomes first-class, matching what
// Copilot does when asked to review work (durable-work skill):
//   - Approve   → status `done`.
//   - Send back → feedback comment (required) + status `todo`, which
//                 re-dispatches the assigned agent with the feedback in thread.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, Textarea } from "@engenty/ui-core";
import { CheckCircle2, ClipboardCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import type { TaskDetail, TaskStatus } from "../../src/schema/types.js";
import { formatAgentTypeKey } from "../lib/format-assignee.js";

interface TaskReviewCardProps {
  disabled?: boolean;
  /** Post the send-back feedback as a task comment. */
  onComment: (content: string) => Promise<void>;
  /** Apply the review decision's status. */
  onStatusChange: (status: TaskStatus) => void | Promise<void>;
  task: TaskDetail;
}

export function TaskReviewCard({
  task,
  onComment,
  onStatusChange,
  disabled = false,
}: TaskReviewCardProps) {
  const { t } = useTranslation("tasks");
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  // Only a task actually waiting on a human decision shows this.
  if (task.status !== "in_review") {
    return null;
  }

  const agentLabel = task.primary_assignee_agent_type_key
    ? formatAgentTypeKey(task.primary_assignee_agent_type_key)
    : null;
  const feedbackReady = feedback.trim().length > 0;
  const locked = disabled || busy;

  const handleApprove = async () => {
    setBusy(true);
    try {
      await onStatusChange("done");
    } finally {
      setBusy(false);
    }
  };

  const handleSendBack = async () => {
    const content = feedback.trim();
    if (!content) {
      return;
    }
    setBusy(true);
    try {
      // Comment first: the agent's next run reads the thread, so the feedback
      // must already be there when `todo` re-dispatches it.
      await onComment(content);
      await onStatusChange("todo");
      setFeedback("");
      setSendBackOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 border-violet-500/40 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <ClipboardCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        {t("detail.reviewTitle")}
      </div>
      <p className="text-muted-foreground text-xs">
        {agentLabel
          ? t("detail.reviewBody", { agent: agentLabel })
          : t("detail.reviewBodyGeneric")}
      </p>

      {sendBackOpen ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            className="min-h-20 resize-y text-sm"
            disabled={locked}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={t("detail.reviewFeedbackPlaceholder")}
            value={feedback}
          />
          {feedbackReady ? null : (
            <p className="text-muted-foreground text-xs">
              {t("detail.reviewFeedbackRequired")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={locked || !feedbackReady}
              onClick={() => void handleSendBack()}
              size="sm"
              type="button"
              variant="default"
            >
              <Undo2 className="mr-1.5 size-3.5" />
              {t("detail.reviewSendBack")}
            </Button>
            <Button
              disabled={locked}
              onClick={() => {
                setSendBackOpen(false);
                setFeedback("");
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("detail.reviewCancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={locked}
            onClick={() => void handleApprove()}
            size="sm"
            type="button"
          >
            <CheckCircle2 className="mr-1.5 size-3.5" />
            {t("detail.reviewApprove")}
          </Button>
          <Button
            disabled={locked}
            onClick={() => setSendBackOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Undo2 className="mr-1.5 size-3.5" />
            {t("detail.reviewSendBack")}
          </Button>
        </div>
      )}
    </Card>
  );
}
