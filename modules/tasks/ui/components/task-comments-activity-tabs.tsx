import { PromptInputProvider, ThreadStatusIcon } from "@engenty/ai-ui";
import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { cn, Tabs, TabsContent, TabsList, TabsTrigger } from "@engenty/ui-core";
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  TaskActivity,
  TaskDetail,
  TaskRun,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { useDockedColumnFooter } from "../hooks/use-docked-column-footer.js";
import { isTaskRunLiveActive } from "../lib/task-run-live.js";
import { TaskActivityList } from "./task-activity-feed.js";
import {
  type AssigneeProfiles,
  FEED_SCROLL_PAD_CLASS,
  TaskCommentComposer,
  TaskCommentsList,
} from "./task-comments-parts.js";

interface TaskCommentsActivityTabsProps {
  activity: TaskActivity[];
  assigneeProfiles?: AssigneeProfiles;
  commentDraft: string;
  /**
   * Pending decision cards (review, tool approval) rendered as the last item of
   * the comment thread. A decision is about the conversation, so it belongs at
   * the end of it — not stranded in a panel above the run list.
   */
  decisionSlot?: ReactNode;
  disabled?: boolean;
  onAddComment: () => void | Promise<void>;
  onCommentDraftChange: (value: string) => void;
  posting?: boolean;
  runs: TaskRun[];
  runsSlot: ReactNode;
  scrollRootRef: RefObject<HTMLElement | null>;
  statusDefinitions?: TaskStatusDefinition[];
  task: TaskDetail;
}

type ThreadStatus = ComponentProps<typeof ThreadStatusIcon>["status"];

function resolveRunsStatus(runs: TaskRun[]): ThreadStatus {
  if (runs.some((run) => isTaskRunLiveActive(run))) {
    return "running";
  }
  const latest = runs[0];
  if (!latest) {
    return "idle";
  }
  if (latest.outcome === "failed") {
    return "failed";
  }
  if (latest.outcome === "needs_approval" || latest.outcome === "needs_input") {
    return "waiting";
  }
  if (
    latest.outcome === "completed" ||
    latest.outcome === "completed_quiet" ||
    latest.finished_at ||
    latest.run_finished_at
  ) {
    return "completed";
  }
  return "idle";
}

function TaskCommentsTabPanel({
  task,
  assigneeProfiles,
  commentDraft,
  decisionSlot,
  disabled,
  onAddComment,
  onCommentDraftChange,
  posting,
  scrollRootRef,
}: {
  assigneeProfiles?: AssigneeProfiles;
  commentDraft: string;
  decisionSlot?: ReactNode;
  disabled?: boolean;
  onAddComment: () => void | Promise<void>;
  onCommentDraftChange: (value: string) => void;
  posting?: boolean;
  scrollRootRef: RefObject<HTMLElement | null>;
  task: TaskDetail;
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

        {decisionSlot ? (
          <div className={cn("space-y-3", FEED_SCROLL_PAD_CLASS)}>
            {decisionSlot}
          </div>
        ) : null}

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
  decisionSlot,
  onCommentDraftChange,
  onAddComment,
  disabled = false,
  posting = false,
  runs,
  runsSlot,
  assigneeProfiles,
  scrollRootRef,
  statusDefinitions = [],
}: TaskCommentsActivityTabsProps) {
  const { t } = useTranslation("tasks");
  const [activeTab, setActiveTab] = useState("comments");
  const runsStatus = resolveRunsStatus(runs);
  const runsStatusLabel =
    runsStatus === "running"
      ? t("detail.liveRunInProgress")
      : runsStatus === "failed"
        ? t("detail.runObserver.failed")
        : runsStatus === "waiting"
          ? t("briefing.waiting")
          : runsStatus === "completed"
            ? t("detail.liveRunFinished")
            : t("detail.runs");

  return (
    <section className="space-y-3">
      <Tabs onValueChange={setActiveTab} value={activeTab}>
        <div className="border-border border-b">
          <TabsList className="h-9 justify-start" variant="line">
            <TabsTrigger value="comments">{t("detail.comments")}</TabsTrigger>
            <TabsTrigger value="activity">{t("detail.activity")}</TabsTrigger>
            <TabsTrigger value="runs">
              <ThreadStatusIcon label={runsStatusLabel} status={runsStatus} />
              {t("detail.runs")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="mt-3" value="comments">
          {activeTab === "comments" ? (
            <TaskCommentsTabPanel
              assigneeProfiles={assigneeProfiles}
              commentDraft={commentDraft}
              decisionSlot={decisionSlot}
              disabled={disabled}
              onAddComment={onAddComment}
              onCommentDraftChange={onCommentDraftChange}
              posting={posting}
              scrollRootRef={scrollRootRef}
              task={task}
            />
          ) : null}
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

        <TabsContent className={cn("mt-3", FEED_SCROLL_PAD_CLASS)} value="runs">
          {runsSlot}
        </TabsContent>
      </Tabs>
    </section>
  );
}
