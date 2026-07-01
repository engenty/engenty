import {
  CopilotCompactComposerShell,
  PromptInput,
  PromptInputBody,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputController,
} from "@engenty/ai-ui";
import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  cn,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { AnimatedSendIcon } from "@engenty/ui-icons";
import { ArrowDown } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  Task,
  TaskActivity,
  TaskComment,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { useDockedColumnFooter } from "../hooks/use-docked-column-footer.js";
import {
  resolveCommentActor,
  resolveTaskCommentAudience,
} from "../lib/format-activity.js";
import { formatActivityTimeLabel } from "../lib/format-activity-time.js";
import { ActivityActorAvatar, TaskActivityList } from "./task-activity-feed.js";

/** Room for card shadows inside padded regions. */
const FEED_SCROLL_PAD_CLASS = "-mx-1.5 px-1.5 py-1";

interface TaskCommentsActivityTabsProps {
  activity: TaskActivity[];
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  commentDraft: string;
  disabled?: boolean;
  onAddComment: () => void | Promise<void>;
  onCommentDraftChange: (value: string) => void;
  posting?: boolean;
  scrollRootRef: RefObject<HTMLElement | null>;
  statusDefinitions?: TaskStatusDefinition[];
  task: Task;
}

function TaskCommentItem({
  comment,
  task,
  assigneeProfiles,
}: {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  comment: TaskComment;
  task: Task;
}) {
  const { t } = useTranslation("tasks");
  const actor = resolveCommentActor(comment, assigneeProfiles, t);
  const audience = resolveTaskCommentAudience(task, comment);
  const timeLabel = formatActivityTimeLabel(comment.created_at, t);
  const elevated = audience !== "team";

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
      <time
        className="text-muted-foreground text-xs"
        dateTime={comment.created_at}
        title={new Date(comment.created_at).toLocaleString()}
      >
        {timeLabel}
      </time>
    </div>
  );

  const body = (
    <p className="mt-1 whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
      {comment.content}
    </p>
  );

  const content = (
    <div className="flex min-w-0 items-start gap-2.5">
      <ActivityActorAvatar actor={actor} />
      <div className="min-w-0 flex-1">
        {header}
        {body}
      </div>
    </div>
  );

  if (elevated) {
    return (
      <li className="rounded-lg bg-card px-3 py-2.5 shadow-sm">{content}</li>
    );
  }

  return <li className="py-2">{content}</li>;
}

function TaskCommentsList({
  comments,
  task,
  assigneeProfiles,
}: {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  comments: TaskComment[];
  task: Task;
}) {
  const { t } = useTranslation("tasks");
  const endRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  const sortedComments = useMemo(
    () =>
      [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [comments]
  );

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
          {sortedComments.map((comment) => (
            <TaskCommentItem
              assigneeProfiles={assigneeProfiles}
              comment={comment}
              key={comment.id}
              task={task}
            />
          ))}
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

function TaskCommentComposer({
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

function TaskCommentsTabPanel({
  task,
  assigneeProfiles,
  commentDraft,
  disabled,
  onAddComment,
  onCommentDraftChange,
  posting,
  scrollRootRef,
}: {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  commentDraft: string;
  disabled?: boolean;
  onAddComment: () => void | Promise<void>;
  onCommentDraftChange: (value: string) => void;
  posting?: boolean;
  scrollRootRef: RefObject<HTMLElement | null>;
  task: Task;
}) {
  const { mainContentReady, mainContentRef } = useCopilotShell();
  const {
    columnRef,
    composerHeight,
    docked,
    dockStyle,
    footerRef,
    sentinelRef,
  } = useDockedColumnFooter({
    anchorRef: mainContentRef,
    enabled: mainContentReady,
    scrollRootRef,
  });

  const composer = (
    <PromptInputProvider initialInput={commentDraft}>
      <TaskCommentComposer
        commentDraft={commentDraft}
        disabled={disabled}
        onAddComment={onAddComment}
        onCommentDraftChange={onCommentDraftChange}
        posting={posting}
      />
    </PromptInputProvider>
  );

  const composerShell = (
    <div
      className={cn(
        "transition-[transform,opacity] duration-300 ease-out",
        docked
          ? "bg-gradient-to-t from-background via-background/95 to-transparent pt-6 pb-3"
          : "pt-3"
      )}
      ref={footerRef}
    >
      {composer}
    </div>
  );

  const dockedComposer =
    docked && mainContentReady && mainContentRef.current
      ? createPortal(
          <div className="pointer-events-none absolute z-40" style={dockStyle}>
            <div className="pointer-events-auto">{composerShell}</div>
          </div>,
          mainContentRef.current
        )
      : null;

  return (
    <>
      <div className="relative" ref={columnRef}>
        <TaskCommentsList
          assigneeProfiles={assigneeProfiles}
          comments={task.comments}
          task={task}
        />

        <div aria-hidden className="h-px w-full" ref={sentinelRef} />

        {docked && composerHeight > 0 ? (
          <div aria-hidden style={{ height: composerHeight }} />
        ) : null}

        {docked ? null : composerShell}
      </div>
      {dockedComposer}
    </>
  );
}

export function TaskCommentsActivityTabs({
  task,
  activity,
  commentDraft,
  onCommentDraftChange,
  onAddComment,
  disabled = false,
  posting = false,
  assigneeProfiles,
  scrollRootRef,
  statusDefinitions = [],
}: TaskCommentsActivityTabsProps) {
  const { t } = useTranslation("tasks");

  return (
    <section className="space-y-3">
      <Tabs defaultValue="comments">
        <TabsList className="h-9 w-full justify-start bg-transparent p-0">
          <TabsTrigger className="px-0 pr-4" value="comments">
            {t("detail.comments")}
          </TabsTrigger>
          <TabsTrigger className="px-0 pr-4" value="activity">
            {t("detail.activity")}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="mt-3" value="comments">
          <TaskCommentsTabPanel
            assigneeProfiles={assigneeProfiles}
            commentDraft={commentDraft}
            disabled={disabled}
            onAddComment={onAddComment}
            onCommentDraftChange={onCommentDraftChange}
            posting={posting}
            scrollRootRef={scrollRootRef}
            task={task}
          />
        </TabsContent>

        <TabsContent
          className={cn("mt-3", FEED_SCROLL_PAD_CLASS)}
          value="activity"
        >
          <TaskActivityList
            activity={activity}
            assigneeProfiles={assigneeProfiles}
            statusDefinitions={statusDefinitions}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
