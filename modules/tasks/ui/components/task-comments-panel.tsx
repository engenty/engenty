import { PromptInputProvider } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useLiveCache } from "@engenty/live-cache";
import { cn } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo, useState } from "react";
import { useTeamMembersCatalogQuery } from "../hooks/use-team-catalog-query.js";
import { buildAssigneeProfileMap } from "../plugins.js";
import { createTaskDetailLiveBindings } from "../tasks-live-cache.js";
import {
  useAddTaskCommentMutation,
  useTaskDetailQuery,
} from "../tasks-queries.js";
import {
  TaskCommentComposer,
  TaskCommentsList,
} from "./task-comments-parts.js";

interface TaskCommentsPanelProps {
  className?: string;
  taskId: string;
}

/**
 * Self-contained comments thread for a single task: owns its own fetch,
 * realtime subscription and post mutation so any module can drop it in with
 * just a task id. The tasks detail page uses TaskCommentsActivityTabs instead,
 * which pairs comments with the activity feed and docks the composer.
 */
export function TaskCommentsPanel({
  taskId,
  className,
}: TaskCommentsPanelProps) {
  const { t } = useTranslation("tasks");
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const [commentDraft, setCommentDraft] = useState("");

  const liveBindings = useMemo(
    () => (taskId ? createTaskDetailLiveBindings(taskId) : []),
    [taskId]
  );

  useLiveCache({
    bindings: liveBindings,
    channelName: `tasks:comments:${currentTenant?.id ?? "none"}:${taskId}`,
    ctx: {
      tenantId: currentTenant?.id ?? "",
      userId: currentUserId ?? undefined,
      routeParams: { taskId },
    },
    enabled: Boolean(taskId && currentTenant?.id),
  });

  const detailQuery = useTaskDetailQuery(taskId || null);
  const commentMutation = useAddTaskCommentMutation(taskId);
  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();

  const assigneeProfiles = useMemo(
    () => buildAssigneeProfileMap(teamMembersCatalogQuery.data ?? []),
    [teamMembersCatalogQuery.data]
  );

  const handleAddComment = useCallback(async () => {
    const content = commentDraft.trim();
    if (!content) {
      return;
    }
    await commentMutation.mutateAsync(content);
    setCommentDraft("");
  }, [commentDraft, commentMutation]);

  const task = detailQuery.data;

  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="font-medium text-muted-foreground text-xs">
        {t("detail.comments")}
      </h3>

      {task ? (
        <TaskCommentsList
          assigneeProfiles={assigneeProfiles}
          comments={task.comments}
          task={task}
        />
      ) : null}

      {detailQuery.isError ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          {t("detail.loadFailed")}
        </p>
      ) : null}

      <PromptInputProvider initialInput={commentDraft}>
        <TaskCommentComposer
          commentDraft={commentDraft}
          disabled={!task}
          onAddComment={handleAddComment}
          onCommentDraftChange={setCommentDraft}
          posting={commentMutation.isPending}
        />
      </PromptInputProvider>
    </section>
  );
}
