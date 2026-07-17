import { PromptInputProvider } from "@engenty/ai-ui";
import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { cn, Tabs, TabsContent, TabsList, TabsTrigger } from "@engenty/ui-core";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type {
  TaskActivity,
  TaskDetail,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { useDockedColumnFooter } from "../hooks/use-docked-column-footer.js";
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
  disabled?: boolean;
  onAddComment: () => void | Promise<void>;
  onCommentDraftChange: (value: string) => void;
  posting?: boolean;
  scrollRootRef: RefObject<HTMLElement | null>;
  statusDefinitions?: TaskStatusDefinition[];
  task: TaskDetail;
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
  assigneeProfiles?: AssigneeProfiles;
  commentDraft: string;
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
