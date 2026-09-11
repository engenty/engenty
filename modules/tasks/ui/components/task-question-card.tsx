// The answer box for a task whose agent asked something and stopped.
//
// Sibling of TaskReviewCard (a finished run awaiting judgement) and
// TaskPendingApprovalCard (a run awaiting permission). This one is the third
// kind of waiting: the run could not proceed without a fact only a person has.
//
// It reads the COMMENT thread rather than a status, because the question is a
// comment — see lib/open-question.ts. The question text is NOT repeated here:
// the comment carrying it sits directly above this card, and printing it twice
// was the first thing anyone noticed about the old version. What this card
// contributes is the control, shaped by the agent's `answer_type`.
//
// Answering posts the reply and dispatches the task in one gesture, which is
// the whole point: an answer nobody resumes on is just another comment.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, Checkbox, Textarea } from "@engenty/ui-core";
import { Check, MessageCircleQuestion, Send, X } from "lucide-react";
import { useState } from "react";
import type { TaskDetail } from "../../src/schema/types.js";
import { formatAgentTypeKey } from "../lib/format-assignee.js";
import {
  type OpenTaskQuestion,
  resolveOpenTaskQuestion,
  taskQuestionOptionLabel,
} from "../lib/open-question.js";

interface TaskQuestionCardProps {
  disabled?: boolean;
  /** Post the answer and re-dispatch the task. */
  onAnswer: (content: string) => Promise<unknown>;
  task: TaskDetail;
}

export function TaskQuestionCard({
  task,
  onAnswer,
  disabled = false,
}: TaskQuestionCardProps) {
  const { t } = useTranslation("tasks");
  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const open = resolveOpenTaskQuestion(task.comments);
  if (!open) {
    return null;
  }

  const asker = open.comment.created_by_agent_type_key
    ? formatAgentTypeKey(open.comment.created_by_agent_type_key)
    : null;
  const locked = disabled || busy;

  const submit = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    setBusy(true);
    try {
      await onAnswer(trimmed);
      setAnswer("");
      setPicked([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 border-sky-500/40 bg-sky-500/5 p-4">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <p className="font-semibold text-sm leading-tight">
          {asker
            ? t("detail.questionTitle", { agent: asker })
            : t("detail.questionTitleGeneric")}
        </p>
      </div>

      <AnswerControl
        locked={locked}
        onAnswerChange={setAnswer}
        onPickedChange={setPicked}
        onSubmit={submit}
        open={open}
        picked={picked}
        text={answer}
      />

      <p className="text-muted-foreground text-xs">
        {t("detail.questionAnswerHint")}
      </p>
    </Card>
  );
}

/** One control per answer type — the only thing `answer_type` changes. */
function AnswerControl({
  open,
  text,
  picked,
  locked,
  onAnswerChange,
  onPickedChange,
  onSubmit,
}: {
  locked: boolean;
  onAnswerChange: (value: string) => void;
  onPickedChange: (value: string[]) => void;
  onSubmit: (content: string) => Promise<void>;
  open: OpenTaskQuestion;
  picked: string[];
  text: string;
}) {
  const { t } = useTranslation("tasks");

  if (open.answerType === "confirm") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={locked}
          onClick={() => void onSubmit(t("detail.questionYes"))}
          size="sm"
          type="button"
        >
          <Check className="mr-1.5 size-3.5" />
          {t("detail.questionYes")}
        </Button>
        <Button
          disabled={locked}
          onClick={() => void onSubmit(t("detail.questionNo"))}
          size="sm"
          type="button"
          variant="outline"
        >
          <X className="mr-1.5 size-3.5" />
          {t("detail.questionNo")}
        </Button>
      </div>
    );
  }

  if (open.answerType === "single_choice") {
    // One click answers. A single choice has nothing to confirm, and a
    // pick-then-submit dance would add a step for no decision.
    return (
      <div className="flex flex-col gap-1.5">
        {open.options.map((option) => (
          <Button
            className="h-auto justify-start whitespace-normal py-2 text-left"
            disabled={locked}
            key={option.value}
            onClick={() => void onSubmit(option.value)}
            size="sm"
            type="button"
            variant="outline"
          >
            {taskQuestionOptionLabel(option)}
          </Button>
        ))}
      </div>
    );
  }

  if (open.answerType === "multi_choice") {
    const toggle = (value: string) => {
      onPickedChange(
        picked.includes(value)
          ? picked.filter((v) => v !== value)
          : [...picked, value]
      );
    };
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-1.5">
          {open.options.map((option) => (
            <label
              className="flex cursor-pointer items-start gap-2 text-sm leading-snug"
              key={option.value}
            >
              <Checkbox
                checked={picked.includes(option.value)}
                className="mt-0.5"
                disabled={locked}
                onCheckedChange={() => toggle(option.value)}
              />
              <span>{taskQuestionOptionLabel(option)}</span>
            </label>
          ))}
        </div>
        <Button
          disabled={locked || picked.length === 0}
          onClick={() => void onSubmit(picked.join(", "))}
          size="sm"
          type="button"
        >
          <Send className="mr-1.5 size-3.5" />
          {t("detail.questionAnswer")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        className="min-h-20 resize-y text-sm"
        disabled={locked}
        onChange={(event) => onAnswerChange(event.target.value)}
        placeholder={t("detail.questionAnswerPlaceholder")}
        value={text}
      />
      <Button
        disabled={locked || text.trim().length === 0}
        onClick={() => void onSubmit(text)}
        size="sm"
        type="button"
      >
        <Send className="mr-1.5 size-3.5" />
        {t("detail.questionAnswer")}
      </Button>
    </div>
  );
}
