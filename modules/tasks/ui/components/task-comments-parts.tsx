import {
  CopilotCompactComposerShell,
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputController,
} from "@engenty/ai-ui";
import { MessageResponse } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, cn } from "@engenty/ui-core";
import { AnimatedSendIcon } from "@engenty/ui-icons";
import { ArrowDown, CornerDownRight, Info } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Task,
  TaskComment,
  TaskQuestionOption,
} from "../../src/schema/types.js";
import {
  quoteQuestion,
  resolveAnsweredQuestions,
} from "../lib/answered-questions.js";
import {
  resolveCommentActor,
  resolveTaskCommentAudience,
} from "../lib/format-activity.js";
import { formatActivityTimeLabel } from "../lib/format-activity-time.js";
import { taskQuestionOptionLabel } from "../lib/open-question.js";
import { linkifyChildren } from "./comment-object-links.js";
import { ActivityActorAvatar } from "./task-activity-feed.js";

/** Room for card shadows inside padded regions. */
export const FEED_SCROLL_PAD_CLASS = "-mx-1.5 px-1.5 py-1";

/**
 * Object references an agent mentions become links to the record itself, so a
 * reviewer can open what they are approving. Applied to the text-bearing
 * markdown nodes only — code blocks keep ids literal.
 */
const COMMENT_MARKDOWN_COMPONENTS = {
  li: ({ children, ...props }: { children?: React.ReactNode }) => (
    <li {...props}>{linkifyChildren(children)}</li>
  ),
  p: ({ children, ...props }: { children?: React.ReactNode }) => (
    <p {...props}>{linkifyChildren(children)}</p>
  ),
};

/** Profiles keyed by user id, used to name comment authors. */
export type AssigneeProfiles = Map<string, { full_name: string; id: string }>;

/** Only the fields the audience/actor resolution needs, so both Task and TaskDetail fit. */
type CommentAudienceTask = Pick<
  Task,
  "collaborator_user_ids" | "created_by_user_id" | "primary_assignee_user_id"
>;

/**
 * What the agent OFFERED. The options live in the question comment's metadata
 * and were rendered only by the live answer card, so the moment anyone answered,
 * the thread lost all trace of what the choice had been between. The chosen one
 * is marked, which is the whole point of keeping them.
 */
function TaskQuestionOptions({
  answer,
  options,
}: {
  answer?: TaskComment;
  options: TaskQuestionOption[];
}) {
  if (options.length === 0) {
    return null;
  }
  const answered = answer?.content.trim().toLowerCase();
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {options.map((option) => {
        const label = taskQuestionOptionLabel(option);
        const picked =
          Boolean(answered) &&
          (answered === label.toLowerCase() ||
            answered === option.value.trim().toLowerCase());
        return (
          <li key={option.value}>
            <Badge
              className={cn(
                "font-normal text-xxs",
                picked && "border-sky-500/40 bg-sky-500/10 text-sky-700"
              )}
              variant={picked ? "outline" : "secondary"}
            >
              {label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function TaskCommentItem({
  answersQuestion,
  comment,
  questionAnswer,
  task,
  assigneeProfiles,
}: {
  /** The question this comment replies to, when it replies to one. */
  answersQuestion?: TaskComment;
  assigneeProfiles?: AssigneeProfiles;
  comment: TaskComment;
  /** The reply this comment received, when this comment is an answered question. */
  questionAnswer?: TaskComment;
  task: CommentAudienceTask;
}) {
  const { t } = useTranslation("tasks");
  const actor = resolveCommentActor(comment, assigneeProfiles, t);
  const audience = resolveTaskCommentAudience(task, comment);
  const timeLabel = formatActivityTimeLabel(comment.created_at, t);
  // `kind` is a column now, so the thread can show what each entry IS without
  // parsing its text. A question and a result read very differently at a
  // glance; a `system` notice is not somebody talking and should recede.
  const kind = comment.kind ?? "note";
  const isSystem = kind === "system";
  const elevated = !isSystem && audience !== "team";

  // Lifecycle notices ("the flow is waiting for approval") are not a voice in
  // the conversation — one quiet line, no avatar, no author.
  if (isSystem) {
    return (
      <li className="flex items-baseline gap-2 px-1 py-1.5 text-muted-foreground text-xs">
        <Info className="size-3.5 shrink-0 translate-y-0.5" />
        <span className="min-w-0 flex-1">{comment.content}</span>
        <time className="shrink-0 tabular-nums" dateTime={comment.created_at}>
          {timeLabel}
        </time>
      </li>
    );
  }

  const header = (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-semibold text-foreground text-sm leading-snug">
        {actor.label}
      </span>
      {audience === "agent" ? (
        <Badge className="font-normal text-xxs" variant="secondary">
          {t("detail.activityAgentBadge")}
        </Badge>
      ) : null}
      {audience === "outside" ? (
        <Badge className="font-normal text-xxs" variant="outline">
          {t("detail.commentGuestBadge")}
        </Badge>
      ) : null}
      {kind === "question" || kind === "result" ? (
        <Badge
          className={
            kind === "question"
              ? "border-sky-500/40 bg-sky-500/10 font-normal text-sky-700 text-xxs dark:text-sky-300"
              : "font-normal text-xxs"
          }
          variant={kind === "question" ? "outline" : "secondary"}
        >
          {t(
            kind === "question"
              ? "detail.commentKindQuestion"
              : "detail.commentKindResult"
          )}
        </Badge>
      ) : null}
      <time
        className="text-muted-foreground text-xs"
        dateTime={comment.created_at}
        title={new Date(comment.created_at).toLocaleString()}
      >
        {timeLabel}
      </time>
    </div>
  );

  // Agents write markdown (lists, code spans, emphasis) — rendering it raw made
  // result comments read as noise. Same renderer the chat surface uses.
  const body = (
    <MessageResponse
      className="mt-1 text-foreground/90 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
      components={COMMENT_MARKDOWN_COMPONENTS}
    >
      {comment.content}
    </MessageResponse>
  );

  // A reply carries its question with it. Without this, scrolling back past the
  // agent's follow-up comments is the only way to learn what "Hans" meant.
  const quotedQuestion = answersQuestion ? (
    <p className="mt-1 flex items-baseline gap-1.5 border-sky-500/30 border-l-2 pl-2 text-muted-foreground text-xs">
      <CornerDownRight className="size-3 shrink-0 translate-y-0.5" />
      <span className="min-w-0">{quoteQuestion(answersQuestion.content)}</span>
    </p>
  ) : null;

  const content = (
    <div className="flex min-w-0 items-start gap-2.5">
      <ActivityActorAvatar actor={actor} />
      <div className="min-w-0 flex-1">
        {header}
        {quotedQuestion}
        {body}
        {kind === "question" ? (
          <TaskQuestionOptions
            {...(questionAnswer ? { answer: questionAnswer } : {})}
            options={comment.metadata?.options ?? []}
          />
        ) : null}
      </div>
    </div>
  );

  if (elevated) {
    return (
      <li
        className={cn(
          "ui-card-raised px-3 py-2.5",
          // Same sky as TaskQuestionCard, so the question and the box that
          // answers it read as one thing.
          kind === "question" && "border-sky-500/30 border-l-2"
        )}
      >
        {content}
      </li>
    );
  }

  return <li className="py-2">{content}</li>;
}

export function TaskCommentsList({
  comments,
  task,
  assigneeProfiles,
}: {
  assigneeProfiles?: AssigneeProfiles;
  comments: TaskComment[];
  task: CommentAudienceTask;
}) {
  const { t } = useTranslation("tasks");
  const endRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  const sortedComments = useMemo(
    () =>
      [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [comments]
  );

  // Both directions of the same pairing: an answer needs its question above it,
  // an answered question needs to know which option was taken.
  const answeredQuestions = useMemo(
    () => resolveAnsweredQuestions(sortedComments),
    [sortedComments]
  );
  const answersByQuestionId = useMemo(() => {
    const byQuestion = new Map<string, TaskComment>();
    for (const [answerId, question] of answeredQuestions) {
      const answer = sortedComments.find((c) => c.id === answerId);
      if (answer) {
        byQuestion.set(question.id, answer);
      }
    }
    return byQuestion;
  }, [answeredQuestions, sortedComments]);

  const scrollToLatest = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    const end = endRef.current;
    if (!end) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setShowJump(!entry.isIntersecting),
      { root: null, rootMargin: "0px", threshold: 0 }
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [sortedComments.length]);

  const prevLengthRef = useRef(sortedComments.length);
  useEffect(() => {
    if (sortedComments.length > prevLengthRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    prevLengthRef.current = sortedComments.length;
  }, [sortedComments.length]);

  return (
    <div className="relative">
      {showJump ? (
        <div className="sticky top-1 z-10 flex justify-end pb-2">
          <Button
            className="h-6 gap-1 rounded-full px-2.5 text-xs shadow-sm"
            onClick={scrollToLatest}
            size="sm"
            variant="outline"
          >
            <ArrowDown className="size-3" />
            {t("detail.jumpToLatest")}
          </Button>
        </div>
      ) : null}

      {sortedComments.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          {t("detail.noComments")}
        </p>
      ) : (
        <ul className={cn("space-y-1", FEED_SCROLL_PAD_CLASS)}>
          {sortedComments.map((comment) => {
            const answersQuestion = answeredQuestions.get(comment.id);
            return (
              <TaskCommentItem
                {...(answersQuestion ? { answersQuestion } : {})}
                assigneeProfiles={assigneeProfiles}
                comment={comment}
                key={comment.id}
                {...(answersByQuestionId.get(comment.id)
                  ? { questionAnswer: answersByQuestionId.get(comment.id) }
                  : {})}
                task={task}
              />
            );
          })}
        </ul>
      )}
      {sortedComments.length > 0 ? (
        <div aria-hidden className="h-px w-full" ref={endRef} />
      ) : null}
    </div>
  );
}

function TaskCommentComposerInner({
  commentDraft,
  disabled,
  onAddComment,
  onCommentDraftChange,
  posting,
}: {
  commentDraft: string;
  disabled?: boolean;
  onAddComment: () => void | Promise<void>;
  onCommentDraftChange: (value: string) => void;
  posting?: boolean;
}) {
  const { t } = useTranslation("tasks");
  const controller = usePromptInputController();

  useEffect(() => {
    controller.textInput.setInput(commentDraft);
  }, [commentDraft, controller.textInput]);

  const handleSubmit = useCallback(
    async (message: { files: unknown[]; text: string }) => {
      const text = message.text?.trim();
      if (!text || disabled || posting) {
        return;
      }
      onCommentDraftChange(text);
      await Promise.resolve(onAddComment());
    },
    [disabled, onAddComment, onCommentDraftChange, posting]
  );

  const submitStatus = posting ? "submitted" : "ready";

  return (
    <PromptInput
      className="h-auto bg-transparent dark:bg-transparent"
      onSubmit={handleSubmit}
      plain
    >
      <PromptInputBody>
        <div className="flex w-full items-end gap-1.5">
          <div className="relative min-w-0 flex-1 self-center">
            <PromptInputTextarea
              className="max-h-32 min-h-8 resize-none px-1 py-1.5 text-sm leading-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              disabled={disabled || posting}
              onChange={(event) =>
                onCommentDraftChange(event.currentTarget.value)
              }
              placeholder={t("detail.commentPlaceholder")}
              rows={1}
            />
          </div>
          <PromptInputSubmit
            className="-mr-1 size-8 shrink-0 self-end rounded-full shadow-none"
            disabled={disabled || posting || commentDraft.trim().length === 0}
            size="icon-sm"
            status={submitStatus}
            variant="default"
          >
            {submitStatus === "ready" ? (
              <AnimatedSendIcon play={posting ? "always" : "hover"} size="sm" />
            ) : undefined}
          </PromptInputSubmit>
        </div>
      </PromptInputBody>
    </PromptInput>
  );
}

export function TaskCommentComposer({
  commentDraft,
  disabled,
  onAddComment,
  onCommentDraftChange,
  posting,
}: {
  commentDraft: string;
  disabled?: boolean;
  onAddComment: () => void | Promise<void>;
  onCommentDraftChange: (value: string) => void;
  posting?: boolean;
}) {
  return (
    <CopilotCompactComposerShell
      chatStatus={posting ? "submitted" : "ready"}
      enableStatusFlap={false}
      showAvatar={false}
      showUsageMeter={false}
    >
      <TaskCommentComposerInner
        commentDraft={commentDraft}
        disabled={disabled}
        onAddComment={onAddComment}
        onCommentDraftChange={onCommentDraftChange}
        posting={posting}
      />
    </CopilotCompactComposerShell>
  );
}
